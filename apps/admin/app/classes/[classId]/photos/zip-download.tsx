"use client";

import { useState } from "react";
import { downloadZip } from "client-zip";
import { Download } from "lucide-react";

type Kind = "all" | "jpeg" | "raw";
const KIND_LABEL: Record<Kind, string> = { all: "усі", jpeg: "JPEG", raw: "RAW" };

type SaveFilePicker = (opts: {
  suggestedName: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}) => Promise<{ createWritable: () => Promise<WritableStream> }>;

/**
 * Кнопки «Завантажити все / Тільки JPEG / Тільки RAW» галереї класу.
 * Архів пакує браузер (client-zip) прямо зі Storage: сервер віддає лише
 * список підписаних посилань, тож гігабайти не проходять через Vercel.
 * У Chrome/Edge архів одразу пишеться на диск (showSaveFilePicker).
 */
export function ZipDownload({
  classId,
  category,
  categoryLabel,
}: {
  classId: string;
  category: string;
  categoryLabel: string | null;
}) {
  const [progress, setProgress] = useState<{ kind: Kind; done: number; total: number } | null>(null);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  async function run(kind: Kind) {
    setMessage(null);
    const name = `${categoryLabel ? `${categoryLabel} — ` : ""}${KIND_LABEL[kind]}.zip`;
    const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
    // Файл для збереження просимо одразу — поки діє клік (вимога браузера).
    let writable: WritableStream | null = null;
    if (picker) {
      try {
        const handle = await picker({ suggestedName: name, types: [{ description: "ZIP-архів", accept: { "application/zip": [".zip"] } }] });
        writable = await handle.createWritable();
      } catch {
        return; // «Скасувати» у вікні збереження
      }
    }
    setProgress({ kind, done: 0, total: 0 });
    try {
      const res = await fetch(`/api/classes/${classId}/photos/download?kind=${kind}&category=${encodeURIComponent(category)}`);
      const data = (await res.json().catch(() => ({}))) as { files?: { path: string; url: string }[]; className?: string; error?: string };
      if (!res.ok || !data.files?.length) throw new Error(data.error ?? "Немає фото за обраними фільтрами");
      const files = data.files;
      setProgress({ kind, done: 0, total: files.length });
      let done = 0;
      async function* entries() {
        for (const f of files) {
          const r = await fetch(f.url);
          if (!r.ok) throw new Error(`Не вдалося завантажити ${f.path}`);
          yield { name: f.path, lastModified: new Date(), input: r };
          setProgress({ kind, done: ++done, total: files.length });
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
        a.download = `${data.className ?? "Клас"} — ${name}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
      setMessage({ type: "ok", text: `Готово: ${files.length} файлів.` });
    } catch (e) {
      await writable?.abort().catch(() => {});
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Не вдалося завантажити" });
    } finally {
      setProgress(null);
    }
  }

  const btn = "inline-flex items-center gap-1 rounded-[9px] border-[1.5px] px-3 py-1.5 text-[12px] font-bold disabled:opacity-50";
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {(["all", "jpeg", "raw"] as Kind[]).map((k) => (
        <button
          key={k}
          onClick={() => run(k)}
          disabled={!!progress}
          className={`${btn} ${
            k === "all"
              ? "border-purple bg-purple-pale text-purple-deep hover:bg-purple-soft"
              : "border-line bg-card text-ink hover:border-purple-soft"
          }`}
        >
          <Download className="h-3.5 w-3.5" />
          {progress?.kind === k
            ? progress.total
              ? `Пакуємо ${progress.done} з ${progress.total}…`
              : "Готуємо список…"
            : k === "all"
              ? `Завантажити все${categoryLabel ? ` (${categoryLabel})` : ""}`
              : k === "jpeg"
                ? "Тільки JPEG"
                : "Тільки RAW"}
        </button>
      ))}
      {message && (
        <span className={`text-[12px] font-semibold ${message.type === "ok" ? "text-ok" : "text-warn"}`}>{message.text}</span>
      )}
    </div>
  );
}
