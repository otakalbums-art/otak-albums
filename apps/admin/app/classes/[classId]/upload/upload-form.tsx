"use client";

import { useRef, useState } from "react";
import { Button } from "@otak/ui";

type Student = { id: string; first_name: string; last_name: string };

const CATEGORIES: { value: string; label: string }[] = [
  { value: "portrait", label: "Портрети" },
  { value: "group", label: "Групові" },
  { value: "ceremony", label: "Церемонія" },
  { value: "personal", label: "Персональна (для одного учня)" },
  { value: "uncategorized", label: "Без категорії" },
];

export function UploadForm({ classId, students }: { classId: string; students: Student[] }) {
  const [category, setCategory] = useState("uncategorized");
  const [studentId, setStudentId] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<"idle" | "uploading" | "done">("idle");
  const [result, setResult] = useState<{ inserted: number; skipped: { filename: string; reason: string }[] } | null>(
    null
  );
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)]);
  }

  async function handleUpload() {
    if (files.length === 0) return;
    if (category === "personal" && !studentId) {
      alert("Оберіть учня для персональної категорії");
      return;
    }

    setStatus("uploading");
    const formData = new FormData();
    formData.set("classId", classId);
    formData.set("category", category);
    if (category === "personal") formData.set("studentId", studentId);
    files.forEach((f) => formData.append("files", f));

    const res = await fetch("/api/photos/upload", { method: "POST", body: formData });
    const data = await res.json();

    setResult({ inserted: data.inserted?.length ?? 0, skipped: data.skipped ?? [] });
    setStatus("done");
    setFiles([]);
  }

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
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
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
        Перетягни JPEG-файли сюди або натисни, щоб обрати
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg"
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      {files.length > 0 && (
        <div className="text-xs text-ink-soft">
          Обрано файлів: <b className="text-ink">{files.length}</b>
        </div>
      )}

      <Button onClick={handleUpload} disabled={files.length === 0 || status === "uploading"} className="w-auto">
        {status === "uploading" ? "Завантажуємо…" : `Завантажити ${files.length || ""}`.trim()}
      </Button>

      {result && (
        <div className="rounded-[9px] border border-line p-3 text-xs">
          <p className="font-semibold text-ok">Завантажено: {result.inserted}</p>
          {result.skipped.length > 0 && (
            <div className="mt-1.5 text-warn">
              Пропущено:
              <ul className="ml-4 list-disc">
                {result.skipped.map((s, i) => (
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
