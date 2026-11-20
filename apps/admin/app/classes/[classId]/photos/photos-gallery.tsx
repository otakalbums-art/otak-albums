"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Check, Download, FolderOpen, Trash2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@otak/supabase/browser";
import { CategoryIcon } from "@/lib/photo-categories";
import { compareFilenames, compareFilenamesDesc } from "@otak/supabase/photo-variants";

type Photo = {
  id: string;
  filename: string;
  storage_path: string;
  file_type: string;
  file_kind: "jpeg" | "raw";
  category: string;
  student_id: string | null;
  uploaded_at: string;
  url: string | null; // мініатюра для сітки
  fullUrl: string | null; // оригінал — для "відкрити"
};

// Ті самі категорії й підписи, що й на /ftp-import (apps/admin/app/ftp-import/ftp-control-panel.tsx)
// і в формі ручного завантаження (upload-form.tsx) — дублюємо тут навмисно,
// це прості довідники, окремий спільний модуль для трьох рядків не виправданий.
const CATEGORY_LABELS: Record<string, string> = {
  portrait: "Портрети",
  group: "Групові",
  ceremony: "Церемонія",
  personal: "Персональні",
  uncategorized: "Без категорії",
};
const CATEGORY_ORDER = ["portrait", "group", "ceremony", "personal", "uncategorized"];

/** Ім'я файлу без розширення й у нижньому регістрі — ключ для парування JPEG+RAW одного кадру. */
function baseName(filename: string) {
  return filename.replace(/\.[^.]+$/, "").toLowerCase();
}


type Shot = {
  key: string;
  category: string;
  baseName: string;
  jpeg: Photo | null;
  raws: Photo[];
  uploadedAt: string;
};

function buildShot(key: string, cluster: Photo[]): Shot {
  let jpeg: Photo | null = null;
  const raws: Photo[] = [];
  let uploadedAt = cluster[0].uploaded_at;
  for (const photo of cluster) {
    if (photo.file_kind === "jpeg") jpeg = photo;
    else raws.push(photo);
    if (photo.uploaded_at > uploadedAt) uploadedAt = photo.uploaded_at;
  }
  return { key, category: cluster[0].category, baseName: baseName(cluster[0].filename), jpeg, raws, uploadedAt };
}

function groupShots(photos: Photo[], newestFirst: boolean): Shot[] {
  // 1) спершу — грубе відро за категорією + іменем файлу.
  const buckets = new Map<string, Photo[]>();
  for (const photo of photos) {
    const key = `${photo.category}::${baseName(photo.filename)}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(photo);
    else buckets.set(key, [photo]);
  }

  // 2) JPEG і RAW одного кадру — одна плитка, навіть якщо RAW завантажили
  //    пізніше вручну (через години). Лише коли в категорії кілька JPEG з
  //    однаковою назвою (лічильник камери перегорнувся) — кожен JPEG окремо,
  //    а RAW прив'язуємо до найближчого за часом.
  const shots: Shot[] = [];
  for (const [key, bucket] of buckets) {
    const jpegs = bucket.filter((p) => p.file_kind === "jpeg");
    if (jpegs.length <= 1) {
      shots.push(buildShot(`${key}::0`, bucket));
      continue;
    }
    const groups = jpegs.map((j) => [j] as Photo[]);
    for (const raw of bucket.filter((p) => p.file_kind !== "jpeg")) {
      const t = new Date(raw.uploaded_at).getTime();
      let best = 0;
      jpegs.forEach((j, i) => {
        if (Math.abs(new Date(j.uploaded_at).getTime() - t) < Math.abs(new Date(jpegs[best].uploaded_at).getTime() - t)) best = i;
      });
      groups[best].push(raw);
    }
    groups.forEach((g, i) => shots.push(buildShot(`${key}::${i}`, g)));
  }

  // Плитки за номером кадру: за замовчуванням від нових до старих (як у батьків), перемикач — у шапці.
  return shots.sort((a, b) =>
    newestFirst ? compareFilenamesDesc(a.baseName, b.baseName) : compareFilenames(a.baseName, b.baseName)
  );
}

/** Усі файли кадру (JPEG + RAW) — видаляються разом. */
function shotIds(shot: Shot) {
  return [...(shot.jpeg ? [shot.jpeg.id] : []), ...shot.raws.map((r) => r.id)];
}

function ShotTile({
  shot,
  selecting,
  selected,
  onToggle,
  onDelete,
}: {
  shot: Shot;
  selecting: boolean;
  selected: boolean;
  onToggle: (e: React.MouseEvent) => void;
  onDelete: () => void;
}) {
  const hasPreview = !!shot.jpeg?.url;
  return (
    <div className={`overflow-hidden rounded-[11px] border bg-page ${selected ? "border-warn ring-2 ring-warn" : "border-line"}`}>
      <div
        // Shift+клік працює й поза режимом вибору — одразу його вмикає.
        onClick={(e) => (selecting || e.shiftKey ? onToggle(e) : undefined)}
        onMouseDown={(e) => e.shiftKey && e.preventDefault() /* без виділення тексту при Shift+клік */}
        className={`group relative aspect-[4/5] select-none bg-gradient-to-br from-purple-pale to-purple-soft bg-cover bg-center ${
          selecting ? "cursor-pointer" : ""
        }`}
        style={hasPreview ? { backgroundImage: `url(${shot.jpeg!.url})` } : undefined}
      >
        {selecting ? (
          <span
            className={`absolute right-[7px] top-[7px] flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-white shadow ${
              selected ? "bg-warn" : "bg-black/30"
            }`}
          >
            {selected && <Check className="h-3 w-3 text-white" strokeWidth={3.5} />}
          </span>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title="Видалити кадр (JPEG і RAW) назавжди"
            className="absolute right-[6px] top-[6px] flex h-[26px] w-[26px] items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity hover:bg-warn focus:opacity-100 group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
        {!hasPreview && (
          <div className="flex h-full w-full items-center justify-center text-purple-deep/40">
            <FolderOpen className="h-8 w-8" />
          </div>
        )}
        <div className="absolute left-[7px] top-[7px] flex flex-wrap gap-1">
          {shot.jpeg && (
            <span className="rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[9.5px] text-white">JPEG</span>
          )}
          {shot.raws.map((raw) => (
            <span key={raw.id} className="rounded-md bg-purple/85 px-1.5 py-0.5 font-mono text-[9.5px] text-white">
              RAW · {raw.file_type.toUpperCase()}
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1 p-2">
        <span className="truncate font-mono text-[10.5px] text-ink-soft" title={shot.jpeg?.filename ?? shot.raws[0]?.filename}>
          {shot.jpeg?.filename ?? shot.raws[0]?.filename}
        </span>
        <div className="flex flex-wrap gap-2">
          {shot.jpeg?.url && (
            <a href={shot.jpeg.fullUrl ?? shot.jpeg.url} target="_blank" rel="noreferrer" className="text-[11px] font-semibold text-purple hover:underline">
              Відкрити JPEG
            </a>
          )}
          {shot.raws.map((raw) => (
            <a
              key={raw.id}
              href={raw.url ?? "#"}
              download={raw.filename}
              className="text-[11px] font-semibold text-purple hover:underline"
            >
              Завантажити {raw.file_type.toUpperCase()}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PhotosGallery({ classId }: { classId: string }) {
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [category, setCategory] = useState<string>("all");
  const [kindFilter, setKindFilter] = useState<"all" | "jpeg" | "raw">("all");
  // Порядок кадрів — лише в адмінці; вибір запам'ятовується в браузері.
  const [newestFirst, setNewestFirst] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem("otak-admin-photo-order") === "oldest") setNewestFirst(false);
    } catch {}
  }, []);
  function changeOrder(next: boolean) {
    setNewestFirst(next);
    try {
      localStorage.setItem("otak-admin-photo-order", next ? "newest" : "oldest");
    } catch {}
  }

  const [live, setLive] = useState(false);
  const loading = useRef(false);
  const reload = useRef<() => void>(() => {});

  // Видалення: режим вибору (ключі плиток) або кнопка-кошик на одній плитці.
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const lastClicked = useRef<string | null>(null);

  /**
   * Нові/видалені фото без перезавантаження сторінки: Supabase Realtime на
   * таблиці photos (адмін автентифікований, RLS is_admin() пропускає події;
   * publication увімкнено в 0002_realtime.sql) + запасне опитування раз на
   * 20 с, якщо з'єднання з realtime обірветься.
   */
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (loading.current) return;
      loading.current = true;
      try {
        const res = await fetch(`/api/classes/${classId}/photos`, { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        const next: Photo[] = data.photos ?? [];
        // Signed URL щоразу новий — для вже показаних фото лишаємо старий, щоб плитки не блимали.
        setPhotos((prev) => {
          // Ключ — id + шлях файлу: якщо камера перенадіслала кадр, показуємо новий файл.
          // Мініатюра могла з'явитись пізніше за фото (backfill) — тоді URL міняється з оригіналу на /THUMB/.
          const known = new Map((prev ?? []).map((p) => [`${p.id}|${p.storage_path}`, p]));
          return next.map((p) => {
            const seen = known.get(`${p.id}|${p.storage_path}`);
            const sameKind = seen && seen.url?.includes("/THUMB/") === p.url?.includes("/THUMB/");
            return seen && sameKind ? { ...p, url: seen.url, fullUrl: seen.fullUrl } : p;
          });
        });
      } finally {
        loading.current = false;
      }
    }

    load();
    reload.current = load;
    const supabase = createSupabaseBrowserClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Камера шле кадри серіями — збираємо їх в одне оновлення.
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(load, 800);
    };
    const channel = supabase
      .channel(`admin-photos-${classId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "photos", filter: `class_id=eq.${classId}` }, schedule)
      // DELETE з фільтром Supabase не доставляє (у події лише id) — слухаємо всі видалення.
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "photos" }, schedule)
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    const poll = setInterval(load, 20000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [classId]);

  const shots = useMemo(() => {
    if (!photos) return [];
    const filtered = photos.filter((p) => {
      if (category !== "all" && p.category !== category) return false;
      if (kindFilter !== "all" && p.file_kind !== kindFilter) return false;
      return true;
    });
    return groupShots(filtered, newestFirst);
  }, [photos, category, kindFilter, newestFirst]);

  const counts = useMemo(() => {
    const jpeg = (photos ?? []).filter((p) => p.file_kind === "jpeg").length;
    const raw = (photos ?? []).filter((p) => p.file_kind === "raw").length;
    return { jpeg, raw, total: (photos ?? []).length };
  }, [photos]);

  /**
   * Клік — вибрати/зняти одну плитку. Shift+клік — усі плитки між попереднім
   * кліком і цим (у тому порядку, як показано), і вони отримують той самий
   * стан, що й ця плитка після кліку — як у провіднику Windows / Finder.
   */
  function toggleShot(key: string, e: React.MouseEvent) {
    if (!selecting) setSelecting(true);
    const index = shots.findIndex((s) => s.key === key);
    const anchor = lastClicked.current ? shots.findIndex((s) => s.key === lastClicked.current) : -1;
    setSelected((prev) => {
      const next = new Set(prev);
      const select = !prev.has(key);
      if (e.shiftKey && anchor >= 0 && index >= 0) {
        const [from, to] = anchor < index ? [anchor, index] : [index, anchor];
        for (const s of shots.slice(from, to + 1)) {
          if (select) next.add(s.key);
          else next.delete(s.key);
        }
      } else if (select) next.add(key);
      else next.delete(key);
      return next;
    });
    lastClicked.current = key;
  }

  function stopSelecting() {
    setSelecting(false);
    setSelected(new Set());
    lastClicked.current = null;
  }

  async function deleteShots(targets: Shot[]) {
    const ids = targets.flatMap(shotIds);
    if (!ids.length) return;
    const jpegs = targets.filter((t) => t.jpeg).length;
    const raws = targets.reduce((n, t) => n + t.raws.length, 0);
    const what =
      targets.length === 1
        ? `кадр ${targets[0].jpeg?.filename ?? targets[0].raws[0]?.filename}`
        : `${targets.length} кадрів`;
    const question = [
      `Видалити ${what} назавжди?`,
      "",
      `Файлів: JPEG — ${jpegs}, RAW — ${raws}.`,
      "Фото зникнуть і з галереї батьків, з їхнього «Обраного» та вибору для альбому. Відновити буде неможливо.",
    ].join("\n");
    if (!confirm(question)) return;
    setDeleting(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/classes/${classId}/photos`, { method: "DELETE", body: JSON.stringify({ ids }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Не вдалося видалити");
      const gone = new Set(ids);
      setPhotos((prev) => (prev ?? []).filter((p) => !gone.has(p.id)));
      stopSelecting();
      setNotice({
        type: "ok",
        text: `Видалено файлів: ${data.deleted}.${
          data.unconfirmed ? ` У ${data.unconfirmed} дітей це фото було у вибраному для альбому — їм треба вибрати заново.` : ""
        }`,
      });
    } catch (e) {
      setNotice({ type: "error", text: e instanceof Error ? e.message : "Не вдалося видалити" });
    } finally {
      setDeleting(false);
      reload.current();
    }
  }

  if (photos === null) {
    return <p className="text-sm text-ink-soft">Завантажуємо…</p>;
  }

  const allSelected = shots.length > 0 && shots.every((s) => selected.has(s.key));

  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-[11px] text-ink-soft">
        <span className={`h-2 w-2 rounded-full ${live ? "bg-ok" : "bg-line"}`} />
        {live ? "Нові фото з'являються автоматично" : "Оновлення раз на 20 секунд"}
      </p>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setCategory("all")}
            className={`rounded-[9px] border-[1.5px] px-3 py-1.5 text-[12px] font-bold transition-colors ${
              category === "all" ? "border-purple bg-purple-pale text-purple-deep" : "border-line bg-card text-ink hover:border-purple-soft"
            }`}
          >
            Усі категорії
          </button>
          {CATEGORY_ORDER.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`rounded-[9px] border-[1.5px] px-3 py-1.5 text-[12px] font-bold transition-colors ${
                category === c ? "border-purple bg-purple-pale text-purple-deep" : "border-line bg-card text-ink hover:border-purple-soft"
              }`}
            >
              <span className="inline-flex items-center gap-1">
                <CategoryIcon category={c} />
                {CATEGORY_LABELS[c]}
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
        <div className="flex gap-[3px] rounded-[9px] border border-line bg-card p-[3px]">
          {([true, false] as const).map((v) => (
            <button
              key={String(v)}
              onClick={() => changeOrder(v)}
              className={`inline-flex items-center gap-1 rounded-[6px] px-3 py-[7px] text-xs font-semibold ${
                newestFirst === v ? "bg-purple-pale text-purple-deep" : "text-ink-soft"
              }`}
            >
              {v ? <ArrowDownWideNarrow className="h-3.5 w-3.5" /> : <ArrowUpNarrowWide className="h-3.5 w-3.5" />}
              {v ? "Нові спершу" : "Старі спершу"}
            </button>
          ))}
        </div>
        <div className="flex gap-[3px] rounded-[9px] border border-line bg-card p-[3px]">
          {(["all", "jpeg", "raw"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKindFilter(k)}
              className={`rounded-[6px] px-3.5 py-[7px] text-xs font-semibold ${
                kindFilter === k ? "bg-purple-pale text-purple-deep" : "text-ink-soft"
              }`}
            >
              {k === "all" ? `Усі (${counts.total})` : k === "jpeg" ? `JPEG (${counts.jpeg})` : `RAW (${counts.raw})`}
            </button>
          ))}
        </div>
        </div>
      </div>

      {/* Завантаження архівом — з урахуванням обраної вище категорії; тип
          файлів (усі/JPEG/RAW) обирається саме кнопкою, незалежно від
          фільтра "Усі/JPEG/RAW" над плитками (той лише для перегляду). */}
      <div className="mb-4 flex flex-wrap gap-2">
        <a
          href={`/api/classes/${classId}/photos/download?kind=all&category=${category}`}
          className="inline-flex items-center gap-1 rounded-[9px] border-[1.5px] border-purple bg-purple-pale px-3 py-1.5 text-[12px] font-bold text-purple-deep hover:bg-purple-soft"
        >
          <Download className="h-3.5 w-3.5" /> Завантажити все{category !== "all" ? ` (${CATEGORY_LABELS[category]})` : ""}
        </a>
        <a
          href={`/api/classes/${classId}/photos/download?kind=jpeg&category=${category}`}
          className="inline-flex items-center gap-1 rounded-[9px] border-[1.5px] border-line bg-card px-3 py-1.5 text-[12px] font-bold text-ink hover:border-purple-soft"
        >
          <Download className="h-3.5 w-3.5" /> Тільки JPEG
        </a>
        <a
          href={`/api/classes/${classId}/photos/download?kind=raw&category=${category}`}
          className="inline-flex items-center gap-1 rounded-[9px] border-[1.5px] border-line bg-card px-3 py-1.5 text-[12px] font-bold text-ink hover:border-purple-soft"
        >
          <Download className="h-3.5 w-3.5" /> Тільки RAW
        </a>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
          disabled={!shots.length || deleting}
          className={`inline-flex items-center gap-1 rounded-[9px] border-[1.5px] px-3 py-1.5 text-[12px] font-bold disabled:opacity-40 ${
            selecting ? "border-warn bg-[#FDECEC] text-warn" : "border-line bg-card text-ink hover:border-warn"
          }`}
        >
          <Trash2 className="h-3.5 w-3.5" /> {selecting ? "Скасувати вибір" : "Вибрати для видалення"}
        </button>
        {selecting && (
          <>
            <button
              onClick={() => setSelected(allSelected ? new Set() : new Set(shots.map((s) => s.key)))}
              className="text-[12px] font-semibold text-purple-deep hover:underline"
            >
              {allSelected ? "Зняти всі" : `Вибрати всі показані (${shots.length})`}
            </button>
            <button
              onClick={() => deleteShots(shots.filter((s) => selected.has(s.key)))}
              disabled={!selected.size || deleting}
              className="inline-flex items-center gap-1 rounded-[9px] bg-warn px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {deleting ? "Видаляємо…" : `Видалити вибрані (${selected.size})`}
            </button>
          </>
        )}
        {notice && (
          <span className={`text-[12px] font-semibold ${notice.type === "ok" ? "text-ok" : "text-warn"}`}>{notice.text}</span>
        )}
      </div>
      {selecting && (
        <p className="-mt-2 mb-3 text-[11px] text-ink-soft">
          Клікайте по плитках, щоб вибрати. <b>Shift + клік</b> — вибрати все між попередньою плиткою і цією (так само
          й зняти). Кадр видаляється разом з усіма своїми файлами (JPEG і RAW). Фільтри категорій і
          JPEG/RAW вище звужують те, що показано і що вибере «Вибрати всі показані».
        </p>
      )}

      {shots.length === 0 ? (
        <p className="text-sm text-ink-soft">Фото ще не завантажені.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {shots.map((shot) => (
            <ShotTile
              key={shot.key}
              shot={shot}
              selecting={selecting}
              selected={selected.has(shot.key)}
              onToggle={(e) => toggleShot(shot.key, e)}
              onDelete={() => deleteShots([shot])}
            />
          ))}
        </div>
      )}

      <p className="mt-4 text-xs text-ink-soft">
        Тут видно і JPEG, і RAW (CR2/NEF/ARW/…) — учні в галереї бачать лише JPEG
        (apps/client/app/gallery). Кадри з однаковою назвою файлу в межах категорії,
        завантажені протягом кількох хвилин одне від одного, показані парою;
        якщо збіг імені випадковий і файли рознесені в часі — це окремі плитки.
      </p>
    </div>
  );
}
