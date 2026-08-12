"use client";

import { useEffect, useMemo, useState } from "react";

type Photo = {
  id: string;
  filename: string;
  storage_path: string;
  file_type: string;
  file_kind: "jpeg" | "raw";
  category: string;
  student_id: string | null;
  uploaded_at: string;
  url: string | null;
};

// Ті самі категорії й підписи, що й на /ftp-import (apps/admin/app/ftp-import/ftp-control-panel.tsx)
// і в формі ручного завантаження (upload-form.tsx) — дублюємо тут навмисно,
// це прості довідники, окремий спільний модуль для трьох рядків не виправданий.
const CATEGORY_LABELS: Record<string, string> = {
  portrait: "📷 Портрети",
  group: "👥 Групові",
  ceremony: "🎓 Церемонія",
  personal: "🙂 Персональні",
  uncategorized: "📁 Без категорії",
};
const CATEGORY_ORDER = ["portrait", "group", "ceremony", "personal", "uncategorized"];

/** Ім'я файлу без розширення й у нижньому регістрі — ключ для парування JPEG+RAW одного кадру. */
function baseName(filename: string) {
  return filename.replace(/\.[^.]+$/, "").toLowerCase();
}

// Камера завантажує JPEG і RAW одного натискання затвора практично одночасно
// (секунди між файлами через FTP/ручне завантаження) — тож пару в межах
// одного вікна вважаємо одним кадром. Якщо просто збігається ім'я файлу, але
// вони прилетіли з різницею більшою за це вікно (напр. лічильник кадрів на
// картці камери перегорнувся через день/тиждень зйомки і повторив ім'я) —
// це вже різні кадри, і об'єднувати їх в одну плитку не варто.
const PAIR_WINDOW_MS = 5 * 60 * 1000; // 5 хв

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

function groupShots(photos: Photo[]): Shot[] {
  // 1) спершу — грубе відро за категорією + іменем файлу.
  const buckets = new Map<string, Photo[]>();
  for (const photo of photos) {
    const key = `${photo.category}::${baseName(photo.filename)}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(photo);
    else buckets.set(key, [photo]);
  }

  // 2) усередині кожного відра — розбиваємо на кластери за часом
  //    завантаження: JPEG+RAW одного кадру лишаються разом, випадковий
  //    повтор імені файлу з великим розривом у часі стає окремою плиткою.
  const shots: Shot[] = [];
  for (const [key, bucket] of buckets) {
    const sorted = [...bucket].sort((a, b) => a.uploaded_at.localeCompare(b.uploaded_at));
    let clusterStart = 0;
    let clusterIndex = 0;
    for (let i = 1; i <= sorted.length; i++) {
      const isLast = i === sorted.length;
      const gap = isLast
        ? Infinity
        : new Date(sorted[i].uploaded_at).getTime() - new Date(sorted[i - 1].uploaded_at).getTime();
      if (isLast || gap > PAIR_WINDOW_MS) {
        shots.push(buildShot(`${key}::${clusterIndex}`, sorted.slice(clusterStart, i)));
        clusterStart = i;
        clusterIndex++;
      }
    }
  }

  return shots.sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));
}

function ShotTile({ shot }: { shot: Shot }) {
  const hasPreview = !!shot.jpeg?.url;
  return (
    <div className="overflow-hidden rounded-[11px] border border-line bg-page">
      <div
        className="relative aspect-[4/5] bg-gradient-to-br from-purple-pale to-purple-soft bg-cover bg-center"
        style={hasPreview ? { backgroundImage: `url(${shot.jpeg!.url})` } : undefined}
      >
        {!hasPreview && (
          <div className="flex h-full w-full items-center justify-center text-3xl text-purple-deep/40">🗂️</div>
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
            <a href={shot.jpeg.url} target="_blank" rel="noreferrer" className="text-[11px] font-semibold text-purple hover:underline">
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

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/classes/${classId}/photos`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setPhotos(data.photos ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [classId]);

  const shots = useMemo(() => {
    if (!photos) return [];
    const filtered = photos.filter((p) => {
      if (category !== "all" && p.category !== category) return false;
      if (kindFilter !== "all" && p.file_kind !== kindFilter) return false;
      return true;
    });
    return groupShots(filtered);
  }, [photos, category, kindFilter]);

  const counts = useMemo(() => {
    const jpeg = (photos ?? []).filter((p) => p.file_kind === "jpeg").length;
    const raw = (photos ?? []).filter((p) => p.file_kind === "raw").length;
    return { jpeg, raw, total: (photos ?? []).length };
  }, [photos]);

  if (photos === null) {
    return <p className="text-sm text-ink-soft">Завантажуємо…</p>;
  }

  return (
    <div>
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
              {CATEGORY_LABELS[c]}
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

      {/* Завантаження архівом — з урахуванням обраної вище категорії; тип
          файлів (усі/JPEG/RAW) обирається саме кнопкою, незалежно від
          фільтра "Усі/JPEG/RAW" над плитками (той лише для перегляду). */}
      <div className="mb-4 flex flex-wrap gap-2">
        <a
          href={`/api/classes/${classId}/photos/download?kind=all&category=${category}`}
          className="rounded-[9px] border-[1.5px] border-purple bg-purple-pale px-3 py-1.5 text-[12px] font-bold text-purple-deep hover:bg-purple-soft"
        >
          ⬇ Завантажити все{category !== "all" ? ` (${CATEGORY_LABELS[category]})` : ""}
        </a>
        <a
          href={`/api/classes/${classId}/photos/download?kind=jpeg&category=${category}`}
          className="rounded-[9px] border-[1.5px] border-line bg-card px-3 py-1.5 text-[12px] font-bold text-ink hover:border-purple-soft"
        >
          ⬇ Тільки JPEG
        </a>
        <a
          href={`/api/classes/${classId}/photos/download?kind=raw&category=${category}`}
          className="rounded-[9px] border-[1.5px] border-line bg-card px-3 py-1.5 text-[12px] font-bold text-ink hover:border-purple-soft"
        >
          ⬇ Тільки RAW
        </a>
      </div>

      {shots.length === 0 ? (
        <p className="text-sm text-ink-soft">Фото ще не завантажені.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {shots.map((shot) => (
            <ShotTile key={shot.key} shot={shot} />
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
