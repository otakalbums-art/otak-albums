"use client";

import { useState } from "react";
import { downloadZip } from "client-zip";
import { Download } from "lucide-react";

type Format = "jpeg" | "raw" | "both";

const FORMAT_LABEL: Record<Format, string> = { jpeg: "Лише JPEG", raw: "Лише RAW", both: "JPEG + RAW" };

type SaveFilePicker = (opts: {
  suggestedName: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}) => Promise<{ createWritable: () => Promise<WritableStream> }>;

/**
 * «Завантажити все вибране для альбому» — один ZIP з папкою на кожну дитину:
 *   Прізвище Ім'я/Портрет — R6__0740.JPG (+ .CR3)
 * Архів пакує браузер (client-zip), файли тягнуться напряму зі Storage. У
 * Chrome/Edge архів одразу пишеться на диск (showSaveFilePicker) — гігабайти
 * RAW не тримаються в пам'яті; в інших браузерах — через Blob.
 */
export function AlbumPhotosDownload({ classId }: { classId: string }) {
  const [format, setFormat] = useState<Format>("both");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string; details?: string[] } | null>(null);

  async function run() {
    setMessage(null);
    const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
    // Файл для збереження просимо одразу — поки діє клік (вимога браузера).
    let writable: WritableStream | null = null;
    if (picker) {
      try {
        const handle = await picker({
          suggestedName: `Альбом — ${FORMAT_LABEL[format]}.zip`,
          types: [{ description: "ZIP-архів", accept: { "application/zip": [".zip"] } }],
        });
        writable = await handle.createWritable();
      } catch {
        return; // натиснули «Скасувати» у вікні збереження
      }
    }

    setProgress({ done: 0, total: 0 });
    try {
      const res = await fetch(`/api/classes/${classId}/crm/download`, {
        method: "POST",
        body: JSON.stringify({ format }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        files?: { path: string; url: string }[];
        missingRaw?: string[];
        className?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Не вдалося підготувати список");
      const files = data.files ?? [];
      if (!files.length) {
        await writable?.abort();
        setMessage({
          type: "error",
          text: format === "raw" ? "Для вибраних фото ще немає жодного RAW на платформі." : "Ще ніхто не вибрав фото для альбому.",
        });
        return;
      }
      setProgress({ done: 0, total: files.length });
      let done = 0;
      async function* entries() {
        for (const f of files) {
          const r = await fetch(f.url);
          if (!r.ok) throw new Error(`Не вдалося завантажити ${f.path}`);
          // Response передаємо як є — client-zip читає його потоком.
          yield { name: f.path, lastModified: new Date(), input: r };
          setProgress({ done: ++done, total: files.length });
        }
      }
      const zip = downloadZip(entries());
      if (writable) {
        await zip.body!.pipeTo(writable);
      } else {
        const blob = await zip.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${data.className ?? "Клас"} — альбом — ${FORMAT_LABEL[format]}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
      const missing = format !== "jpeg" ? data.missingRaw ?? [] : [];
      setMessage({
        type: "ok",
        text: `Готово: ${files.length} файлів.${missing.length ? ` Без RAW (ще не завантажені): ${missing.length}.` : ""}`,
        details: missing,
      });
    } catch (e) {
      await writable?.abort().catch(() => {});
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Не вдалося завантажити" });
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-line p-3.5">
      <div className="mb-2.5 flex items-center gap-1.5 text-[13px] font-bold">
        <Download className="h-4 w-4 text-purple" /> Фото, вибрані для альбому
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-[3px] rounded-[9px] border border-line bg-page p-[3px]">
          {(Object.keys(FORMAT_LABEL) as Format[]).map((f) => (
            <button
              key={f}
              onClick={() => setFormat(f)}
              disabled={!!progress}
              className={`rounded-[6px] px-3 py-[6px] text-[12px] font-semibold ${
                format === f ? "bg-purple-pale text-purple-deep" : "text-ink-soft"
              }`}
            >
              {FORMAT_LABEL[f]}
            </button>
          ))}
        </div>
        <button
          onClick={run}
          disabled={!!progress}
          className="inline-flex items-center gap-1.5 rounded-[9px] bg-purple px-3.5 py-2 text-[12px] font-bold text-white disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          {progress
            ? progress.total
              ? `Пакуємо ${progress.done} з ${progress.total}…`
              : "Готуємо список…"
            : "Завантажити все вибране (ZIP)"}
        </button>
      </div>
      <p className="mt-2 text-[11px] text-ink-soft">
        У архіві — папка на кожну дитину, файли названі за місцем в альбомі: «Портрет — R6__0740.JPG». Окремий файл можна
        завантажити кнопками JPEG / RAW під фото в таблиці.
      </p>
      {message && (
        <div className={`mt-2 text-[12px] font-semibold ${message.type === "ok" ? "text-ok" : "text-warn"}`}>
          {message.text}
          {message.details && message.details.length > 0 && (
            <details className="mt-1 font-normal text-ink-soft">
              <summary className="cursor-pointer">Яких RAW бракує</summary>
              <ul className="ml-4 list-disc">
                {message.details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
