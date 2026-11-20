"use client";

import { useEffect, useState } from "react";
import { downloadZip } from "client-zip";
import { PhotoTile } from "@otak/ui";
import { redirectToLogin } from "@/lib/session-redirect";
import { CheckSquare, Download, EyeOff, Heart, ScanFace, X } from "lucide-react";
import { FaceSearchButton } from "./face-search";

type Photo = {
  id: string;
  filename: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  version?: string;
  is_favorite: boolean;
};

const POLL_MS = 4000;
const ZIP_MAX = 500;

/** Назви файлів у ZIP мають бути унікальні: "R6__0740.JPG", "R6__0740 (2).JPG"… */
function uniqueNames(names: string[]) {
  const used = new Map<string, number>();
  return names.map((n) => {
    const k = n.toLowerCase();
    const c = (used.get(k) ?? 0) + 1;
    used.set(k, c);
    if (c === 1) return n;
    const dot = n.lastIndexOf(".");
    return dot > 0 ? `${n.slice(0, dot)} (${c})${n.slice(dot)}` : `${n} (${c})`;
  });
}

/**
 * Галерея класу. Реалізовано:
 *  - сегментований фільтр Усі/Обране
 *  - періодичне опитування /api/photos, щоб нові фото зʼявлялись без
 *    ручного оновлення сторінки
 *  - лайк ★ прямо на плитці; саме формування фото для альбому зі свого
 *    обраного — окрема сторінка /album (apps/client/app/album/page.tsx)
 *  - завантаження оригіналів JPEG: кнопка на кожній плитці й у перегляді,
 *    а в режимі «Вибрати» — кілька фото одним ZIP (пакується в браузері)
 *
 * Чому не Supabase Realtime (postgres_changes): RLS для anon-ролі
 * навмисно закритий (docs/auth-strategy.md) — учні ходять лише через
 * service_role-захищені route handlers, ніколи напряму до таблиць. Anon
 * ключ (той, що використовує браузерний клієнт) через це ніколи не
 * отримає жодної realtime-події на `photos`, скільки не вмикай publication
 * — RLS блокує доставку на рівні рядка. Опитування через /api/photos
 * обходить цю проблему, лишаючись у межах тієї самої моделі безпеки.
 */
export default function GalleryPage() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [classInfo, setClassInfo] = useState<{ name: string; schoolName: string } | null>(null);
  const [filter, setFilter] = useState<"all" | "favorites">("all");
  const [isLive, setIsLive] = useState(false);
  const [openPhotoId, setOpenPhotoId] = useState<string | null>(null);
  // Режим вибору: клік по плитці вибирає її, вибрані завантажуються одним ZIP.
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [zip, setZip] = useState<{ done: number; total: number } | null>(null);
  const [zipError, setZipError] = useState<string | null>(null);
  // Перемикачі адміна для класу: перегляд фото й завантаження JPEG.
  const [access, setAccess] = useState({ gallery: true, download: true });
  // «Знайти мою дитину»: згода батьків і результат пошуку (id фото дитини).
  const [faceConsent, setFaceConsent] = useState(false);
  const [childIds, setChildIds] = useState<Set<string> | null>(null);

  function refetch() {
    return fetch("/api/photos")
      .then((r) => {
        // Сесія протухла/недійсна (напр. новий логін з того самого акаунту
        // деінде перезаписує session_token — він один на учня) -> на логін,
        // а не мовчки показувати порожню галерею без жодного пояснення.
        if (r.status === 401) {
          redirectToLogin();
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (!data) return;
        // /api/photos видає щоразу НОВИЙ signed URL навіть для тих самих фото
        // (короткоживучі токени) — якщо просто підмінити весь масив, картинка
        // під незмінним <PhotoTile> отримує новий src і перезавантажується
        // заново щопопит (то й було "блимання" кожні кілька секунд). Лишаємо
        // вже завантажений thumbnailUrl для фото, які вже бачили; is_favorite
        // все одно оновлюємо — раптом змінилось з іншого пристрою.
        setPhotos((prev) => {
          // Ключ — id + версія файлу: замінений камерою кадр отримує свіжий URL.
          const known = new Map(prev.map((p) => [`${p.id}|${p.version}`, p]));
          return (data.photos ?? []).map((p: Photo) => {
            const seen = known.get(`${p.id}|${p.version}`);
            return seen ? { ...p, thumbnailUrl: seen.thumbnailUrl, previewUrl: seen.previewUrl } : p;
          });
        });
        if (data.class) setClassInfo(data.class);
        setFaceConsent(!!data.faceConsent);
        const next = { gallery: data.galleryEnabled !== false, download: data.downloadEnabled !== false };
        setAccess((prev) => (prev.gallery === next.gallery && prev.download === next.download ? prev : next));
        // Адмін щойно закрив завантаження — виходимо з режиму вибору.
        if (!next.download) {
          setSelecting(false);
          setSelected(new Set());
        }
        setIsLive(true);
      })
      .catch(() => {});
  }

  useEffect(() => {
    refetch();
    const id = setInterval(refetch, POLL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!openPhotoId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenPhotoId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openPhotoId]);

  const byFilter = filter === "favorites" ? photos.filter((p) => p.is_favorite) : photos;
  const visible = childIds ? byFilter.filter((p) => childIds.has(p.id)) : byFilter;

  async function revokeFaceConsent() {
    if (!confirm("Відкликати згоду на пошук дитини за обличчям?")) return;
    await fetch("/api/faces/consent", { method: "DELETE" });
    setFaceConsent(false);
    setChildIds(null);
  }
  const openPhoto = photos.find((p) => p.id === openPhotoId) ?? null;

  async function toggleFavorite(photoId: string) {
    setPhotos((prev) => prev.map((p) => (p.id === photoId ? { ...p, is_favorite: !p.is_favorite } : p)));
    await fetch(`/api/photos/${photoId}/favorite`, { method: "POST" });
  }

  function toggleSelected(photoId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  }

  function stopSelecting() {
    setSelecting(false);
    setSelected(new Set());
    setZipError(null);
  }

  const allVisibleSelected = visible.length > 0 && visible.every((p) => selected.has(p.id));
  function toggleSelectAll() {
    setSelected(allVisibleSelected ? new Set() : new Set(visible.map((p) => p.id)));
  }

  async function downloadSelected() {
    const ids = photos.filter((p) => selected.has(p.id)).map((p) => p.id);
    if (!ids.length) return;
    setZipError(null);
    // Одне фото — без архіву, просто файл.
    if (ids.length === 1) {
      window.location.href = `/api/photos/${ids[0]}/download`;
      return;
    }
    if (ids.length > ZIP_MAX) {
      setZipError(`За раз можна завантажити до ${ZIP_MAX} фото — зніміть вибір з частини.`);
      return;
    }
    setZip({ done: 0, total: ids.length });
    try {
      const res = await fetch("/api/photos/download", { method: "POST", body: JSON.stringify({ ids }) });
      if (res.status === 401) {
        redirectToLogin();
        return;
      }
      const { files, error } = (await res.json()) as {
        files?: { filename: string; url: string }[];
        error?: string;
      };
      if (!res.ok || !files?.length) throw new Error(error ?? "Не вдалося підготувати фото");
      const names = uniqueNames(files.map((f) => f.filename));
      let done = 0;
      // Оригінали тягнуться по одному прямо зі сховища й одразу пакуються в архів.
      async function* entries() {
        for (let i = 0; i < files!.length; i++) {
          const r = await fetch(files![i].url);
          if (!r.ok) throw new Error(`Не вдалося завантажити ${files![i].filename}`);
          const input = await r.blob();
          setZip({ done: ++done, total: files!.length });
          yield { name: names[i], lastModified: new Date(), input };
        }
      }
      const blob = await downloadZip(entries()).blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const base = (classInfo?.name ?? "Фото").replace(/[\\/:*?"<>|]+/g, " ").trim() || "Фото";
      a.download = `${base} — ${files.length} фото.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      stopSelecting();
    } catch (e) {
      setZipError(e instanceof Error ? e.message : "Не вдалося завантажити фото");
    } finally {
      setZip(null);
    }
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3">
        <h1 className="text-lg font-bold">
          {classInfo ? `${classInfo.name}, ${classInfo.schoolName}` : "…"}
        </h1>
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-[3px] rounded-[9px] border border-line bg-card p-[3px]">
            <button
              onClick={() => setFilter("all")}
              className={`rounded-[6px] px-3.5 py-[7px] text-xs font-semibold ${
                filter === "all" ? "bg-purple-pale text-purple-deep" : "text-ink-soft"
              }`}
            >
              Усі фото
            </button>
            <button
              onClick={() => setFilter("favorites")}
              className={`rounded-[6px] px-3.5 py-[7px] text-xs font-semibold ${
                filter === "favorites" ? "bg-purple-pale text-purple-deep" : "text-ink-soft"
              }`}
            >
              <span className="inline-flex items-center gap-1">
                <Heart className="h-3.5 w-3.5" /> Обране
              </span>
            </button>
          </div>
          {access.download && (
          <button
            onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
            disabled={!photos.length}
            className={`inline-flex items-center gap-1.5 rounded-[9px] border px-3.5 py-[9px] text-xs font-semibold disabled:opacity-40 ${
              selecting ? "border-purple bg-purple-pale text-purple-deep" : "border-line bg-card text-ink"
            }`}
          >
            <CheckSquare className="h-3.5 w-3.5" />
            {selecting ? "Скасувати вибір" : "Вибрати для завантаження"}
          </button>
          )}
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-bold ${
            isLive ? "bg-[#E7F7EE] text-ok" : "bg-line text-ink-soft"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${isLive ? "bg-ok" : "bg-ink-soft"}`} />
          {isLive ? "Оновлюється автоматично" : "Завантаження…"}
        </span>
      </div>

      {childIds && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[10px] border border-purple-soft bg-purple-pale px-3 py-2 text-[13px]">
          <ScanFace className="h-4 w-4 text-purple" />
          <b className="text-purple-deep">Фото вашої дитини: {visible.length}</b>
          <button
            onClick={() => setChildIds(null)}
            className="ml-auto rounded-[8px] bg-card px-2.5 py-1 text-xs font-semibold text-ink hover:text-purple"
          >
            Показати всі фото
          </button>
          <span className="w-full text-[11px] text-ink-soft">
            Знайдено автоматично за обличчям — інколи може показати зайве фото або пропустити потрібне.
          </span>
        </div>
      )}

      {selecting && (
        <p className="mb-3 text-xs text-ink-soft">
          Торкніться фото, щоб вибрати їх, і натисніть «Завантажити» внизу — вибрані прийдуть одним ZIP-архівом в
          оригінальній якості.
        </p>
      )}

      <div className={`grid grid-cols-2 gap-3 sm:grid-cols-4 ${selecting ? "pb-28" : ""}`}>
        {visible.map((photo) => (
          <PhotoTile
            key={photo.id}
            filename={photo.filename}
            thumbnailUrl={photo.thumbnailUrl}
            isFavorite={photo.is_favorite}
            onToggleFavorite={() => toggleFavorite(photo.id)}
            isSelected={selected.has(photo.id)}
            onToggleSelect={selecting ? () => toggleSelected(photo.id) : undefined}
            onOpen={() => (selecting ? toggleSelected(photo.id) : setOpenPhotoId(photo.id))}
            downloadHref={selecting || !access.download ? undefined : `/api/photos/${photo.id}/download`}
          />
        ))}
      </div>

      {!access.gallery && (
        <div className="mt-6 flex flex-col items-center gap-2 rounded-xl border border-line bg-card p-6 text-center">
          <EyeOff className="h-6 w-6 text-ink-soft" />
          <p className="text-sm font-semibold">Перегляд фото зараз закритий</p>
          <p className="text-xs text-ink-soft">
            Фотограф тимчасово приховав фото. Твоє «Обране» збережене — воно з'явиться, щойно перегляд відкриють.
          </p>
        </div>
      )}

      {access.gallery && visible.length === 0 && (
        <p className="mt-6 text-center text-sm text-ink-soft">
          {filter === "favorites" ? "Ще немає обраних фото." : "Фото ще не завантажені."}
        </p>
      )}

      {access.gallery && (
        <p className="mt-4 text-xs text-ink-soft">
          Показані лише файли формату <b>.jpeg</b>.
          {access.download && (
            <>
              {" "}
              Кнопка <Download className="inline h-3 w-3" /> на фото завантажує його в оригінальній якості; щоб
              завантажити кілька — «Вибрати для завантаження».
            </>
          )}
        </p>
      )}
      {access.gallery && faceConsent && (
        <p className="mt-2 text-[11px] text-ink-soft">
          Ви дали згоду на пошук дитини за обличчям.{" "}
          <button onClick={revokeFaceConsent} className="font-semibold text-purple hover:underline">
            Відкликати згоду
          </button>
        </p>
      )}

      {selecting && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-sm font-semibold">Вибрано: {selected.size}</span>
            <button
              onClick={toggleSelectAll}
              disabled={!!zip}
              className="text-xs font-semibold text-purple-deep underline-offset-2 hover:underline"
            >
              {allVisibleSelected ? "Зняти всі" : `Вибрати всі (${visible.length})`}
            </button>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={stopSelecting}
                disabled={!!zip}
                className="rounded-[9px] px-3 py-2 text-xs font-semibold text-ink-soft"
              >
                Скасувати
              </button>
              <button
                onClick={downloadSelected}
                disabled={!selected.size || !!zip}
                className="inline-flex items-center gap-1.5 rounded-[9px] bg-purple px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                {zip ? `Готуємо ${zip.done} з ${zip.total}…` : `Завантажити${selected.size ? ` (${selected.size})` : ""}`}
              </button>
            </div>
            {zipError && <p className="w-full text-xs text-warn">{zipError}</p>}
            {zip && <p className="w-full text-[11px] text-ink-soft">Не закривайте сторінку, поки архів готується.</p>}
          </div>
        </div>
      )}

      {openPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setOpenPhotoId(null)}
        >
          <button
            onClick={() => setOpenPhotoId(null)}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-xl text-white hover:bg-white/20"
            aria-label="Закрити"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Не <img> навмисно: тут лише стиснений preview, а зберігати треба
              оригінал — для цього кнопка «Завантажити» нижче. */}
          <div
            role="img"
            aria-label={openPhoto.filename}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
            onDragStart={(e) => e.preventDefault()}
            className="h-[85vh] w-[90vw] select-none rounded-lg bg-contain bg-center bg-no-repeat shadow-2xl [-webkit-touch-callout:none]"
            style={{ backgroundImage: `url(${openPhoto.previewUrl ?? openPhoto.thumbnailUrl})` }}
          />

          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-6 left-1/2 flex w-max max-w-[92vw] -translate-x-1/2 flex-wrap items-center justify-center gap-x-4 gap-y-2 whitespace-nowrap rounded-2xl bg-black/50 px-4 py-2.5 backdrop-blur-sm"
          >
            <span className="hidden font-mono text-xs text-white/80 sm:inline">{openPhoto.filename}</span>
            <button
              onClick={() => toggleFavorite(openPhoto.id)}
              className={`inline-flex items-center gap-1.5 text-sm font-bold ${openPhoto.is_favorite ? "text-white" : "text-white/60"}`}
            >
              <Heart className={`h-4 w-4 ${openPhoto.is_favorite ? "fill-white" : ""}`} />
              {openPhoto.is_favorite ? "В обраному" : "В обране"}
            </button>
            <FaceSearchButton
              key={openPhoto.id}
              photoId={openPhoto.id}
              imageUrl={openPhoto.previewUrl ?? openPhoto.thumbnailUrl}
              consent={faceConsent}
              onConsentGiven={() => setFaceConsent(true)}
              onResult={(ids) => {
                setChildIds(new Set(ids));
                setFilter("all");
                setOpenPhotoId(null);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            />
            {access.download && (
              <a
                href={`/api/photos/${openPhoto.id}/download`}
                download
                className="inline-flex items-center gap-1.5 text-sm font-bold text-white/80 hover:text-white"
              >
                <Download className="h-4 w-4" />
                Завантажити
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
