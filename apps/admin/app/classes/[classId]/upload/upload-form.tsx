"use client";

import { useRef, useState } from "react";
import { Button } from "@otak/ui";
import { createSupabaseBrowserClient } from "@otak/supabase/browser";

type Student = { id: string; first_name: string; last_name: string };


type Prepared = {
  name: string;
  path?: string;
  token?: string;
  fileType?: string;
  category?: string;
  studentId?: string | null;
  paired?: boolean;
  exists?: boolean;
  error?: string;
};

type Result = {
  jpeg: number;
  rawPaired: number;
  rawAlone: number;
  replaced: number;
  existed: number;
  failed: { filename: string; reason: string }[];
};

const BATCH = 25; // скільки посилань просимо за раз
const PARALLEL = 3; // скільки файлів вантажимо одночасно

/**
 * Ручне завантаження: файли йдуть із браузера напряму в Supabase Storage
 * (підписані посилання з /api/photos/upload-urls), без ліміту Vercel на
 * розмір запиту — тож і RAW по ~20 МБ, і сотні файлів за раз. RAW сам стає
 * в пару до свого JPEG за назвою файлу (R6__0740.CR3 ↔ R6__0740.JPG).
 */
export function UploadForm({
  classId,
  students,
  categories,
}: {
  classId: string;
  students: Student[];
  // Категорії з адмінки «Категорії фото» (photo_categories), у їхньому порядку.
  categories: { value: string; label: string }[];
}) {
  const [category, setCategory] = useState("uncategorized");
  const [studentId, setStudentId] = useState("");
  // Лише файли, яких на платформі ще немає (для дозавантаження загублених кадрів).
  const [onlyNew, setOnlyNew] = useState(true);
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<"idle" | "uploading" | "done">("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<Result | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;
    // Той самий файл, обраний двічі, не дублюємо.
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => f.name.toLowerCase()));
      return [...prev, ...Array.from(list).filter((f) => !seen.has(f.name.toLowerCase()) && seen.add(f.name.toLowerCase()))];
    });
  }

  async function handleUpload() {
    if (files.length === 0) return;
    if (category === "personal" && !studentId) {
      alert("Оберіть учня для персональної категорії");
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const res: Result = { jpeg: 0, rawPaired: 0, rawAlone: 0, replaced: 0, existed: 0, failed: [] };
    const queue = [...files];
    setStatus("uploading");
    setResult(null);
    setProgress({ done: 0, total: queue.length });

    async function uploadOne(file: File, prep: Prepared) {
      if (prep.exists) {
        res.existed++;
        return;
      }
      if (prep.error || !prep.path || !prep.token) {
        res.failed.push({ filename: file.name, reason: prep.error ?? "не вдалося підготувати" });
        return;
      }
      const contentType = prep.fileType === "jpeg" ? "image/jpeg" : "application/octet-stream";
      const { error } = await supabase.storage.from("photos").uploadToSignedUrl(prep.path, prep.token, file, { contentType });
      if (error) {
        res.failed.push({ filename: file.name, reason: error.message });
        return;
      }
      const reg = await fetch("/api/photos/register", {
        method: "POST",
        body: JSON.stringify({
          classId,
          path: prep.path,
          filename: file.name,
          category: prep.category,
          studentId: prep.studentId,
        }),
      });
      const data = await reg.json().catch(() => ({}));
      if (!reg.ok) {
        res.failed.push({ filename: file.name, reason: data.error ?? "не вдалося зберегти" });
        return;
      }
      if (data.replaced) res.replaced++;
      if (prep.fileType === "jpeg") res.jpeg++;
      else if (prep.paired) res.rawPaired++;
      else res.rawAlone++;
    }

    while (queue.length) {
      const batch = queue.splice(0, BATCH);
      const urls = await fetch("/api/photos/upload-urls", {
        method: "POST",
        body: JSON.stringify({
          classId,
          category,
          studentId: category === "personal" ? studentId : null,
          files: batch.map((f) => f.name),
          onlyNew,
        }),
      });
      const { items, error } = await urls.json().catch(() => ({ items: null, error: "помилка сервера" }));
      if (!urls.ok || !items) {
        batch.forEach((f) => res.failed.push({ filename: f.name, reason: error ?? "помилка сервера" }));
        setProgress((p) => ({ ...p, done: p.done + batch.length }));
        continue;
      }
      const pending = batch.map((f, i) => [f, items[i] as Prepared] as const);
      async function worker() {
        while (pending.length) {
          const [file, prep] = pending.shift()!;
          await uploadOne(file, prep);
          setProgress((p) => ({ ...p, done: p.done + 1 }));
        }
      }
      await Promise.all(Array.from({ length: PARALLEL }, worker));
    }

    setResult(res);
    setStatus("done");
    setFiles([]);
  }

  const uploaded = result ? result.jpeg + result.rawPaired + result.rawAlone : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-soft">Категорія</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-[9px] border border-line px-3 py-2 text-sm outline-none focus:border-purple"
          >
            {categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-ink-soft">
            Файл, для якого на платформі вже є пара (RAW ↔ JPEG з такою ж назвою), сам отримає її категорію й стане
            з нею однією плиткою.
          </p>
        </div>
        {category === "personal" && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-soft">Учень</label>
            <select
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="w-full rounded-[9px] border border-line px-3 py-2 text-sm outline-none focus:border-purple"
            >
              <option value="">— Оберіть учня —</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.last_name} {s.first_name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <label className="flex cursor-pointer items-start gap-2.5 rounded-[10px] border border-line bg-page p-3">
        <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} className="mt-0.5 h-4 w-4 accent-purple" />
        <span className="text-xs">
          <b>Лише нові файли</b> — пропускати ті, що вже є на платформі (за назвою файлу). Зручно, щоб дозавантажити
          загублені кадри: оберіть усю картку — прийдуть тільки ті, яких бракує.
          <span className="block text-ink-soft">
            Вимкніть, якщо треба навмисно замінити вже завантажені кадри новими версіями.
          </span>
        </span>
      </label>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-[11px] border-2 border-dashed p-8 text-center text-sm transition-colors ${
          isDragging ? "border-purple bg-purple-pale text-purple-deep" : "border-line text-ink-soft"
        }`}
      >
        Перетягни JPEG або RAW-файли сюди (CR2, CR3, NEF, ARW, RAF, ORF, RW2, DNG…) або натисни, щоб обрати. Можна сотні
        файлів одразу, розмір не обмежений.
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,.jpg,.jpeg,.cr2,.cr3,.nef,.nrw,.arw,.sr2,.raf,.orf,.rw2,.pef,.srw,.x3f,.dng"
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      {files.length > 0 && status !== "uploading" && (
        <div className="text-xs text-ink-soft">
          Обрано файлів: <b className="text-ink">{files.length}</b> ·{" "}
          {(files.reduce((s, f) => s + f.size, 0) / 1e9).toFixed(2)} ГБ
        </div>
      )}

      {status === "uploading" && (
        <div>
          <div className="mb-1 text-xs font-semibold">
            Завантажено {progress.done} з {progress.total} — не закривайте сторінку
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-purple-pale">
            <div
              className="h-full bg-purple transition-all"
              style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      <Button onClick={handleUpload} disabled={files.length === 0 || status === "uploading"} className="w-auto">
        {status === "uploading" ? "Завантажуємо…" : `Завантажити ${files.length || ""}`.trim()}
      </Button>

      {result && (
        <div className="rounded-[9px] border border-line p-3 text-xs">
          <p className="font-semibold text-ok">Завантажено нових: {uploaded}</p>
          <ul className="ml-4 mt-1 list-disc text-ink-soft">
            {result.jpeg > 0 && <li>JPEG: {result.jpeg}</li>}
            {result.rawPaired > 0 && <li>RAW у парі зі своїм JPEG: {result.rawPaired}</li>}
            {result.rawAlone > 0 && <li>RAW без JPEG (лягли в обрану категорію): {result.rawAlone}</li>}
            {result.replaced > 0 && <li>Замінено попередні версії: {result.replaced}</li>}
            {result.existed > 0 && <li>Пропущено — вже є на платформі: {result.existed}</li>}
          </ul>
          {result.failed.length > 0 && (
            <div className="mt-1.5 text-warn">
              Не вдалося ({result.failed.length}):
              <ul className="ml-4 list-disc">
                {result.failed.map((s, i) => (
                  <li key={i}>
                    {s.filename} — {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
