"use client";

import { useRef, useState } from "react";
import { FileUp, X } from "lucide-react";
import { GROUP_COLORS, defaultGroupName, type TimeGroup } from "@otak/supabase/cabinet";

type Row = { lastName: string; firstName: string; shootTime: string | null };
type Parsed = { rows: Row[]; date: string | null };

const TIME_RE = /(\d{1,2})[:.](\d{2})/;

function hhmm(h: string, m: string) {
  return `${h.padStart(2, "0")}:${m}`;
}
function minutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function fromMinutes(n: number) {
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}

/**
 * Рядок таблиці -> дитина. Формат як у Google-таблиці садочка:
 *   "1  10:00  Коваленко Ніколь"  (номер, час, прізвище й ім'я; номер і час — необов'язкові)
 */
function parseLine(line: string): Row | null {
  let rest = line.replace(/\s+/g, " ").trim();
  rest = rest.replace(/^\d{1,3}[.)]?\s+/, ""); // номер рядка
  let shootTime: string | null = null;
  const t = rest.match(new RegExp(`^${TIME_RE.source}\\s+`));
  if (t) {
    shootTime = hhmm(t[1], t[2]);
    rest = rest.slice(t[0].length);
  }
  if (!/^[A-Za-zА-Яа-яІіЇїЄєҐґ'’ʼ-]/.test(rest)) return null;
  if (/прізвище|ім['’ʼ]я/i.test(rest)) return null; // заголовок
  const parts = rest.split(" ").filter(Boolean);
  if (parts.length < 2) return null;
  return { lastName: parts[0], firstName: parts.slice(1).join(" "), shootTime };
}

/** Дата з заголовка ("21.11" або "21.11.2026") -> YYYY-MM-DD. */
function parseDate(text: string): string | null {
  const m = text.match(/(?:^|\s)(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?(?=\s|$)/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
  let y = m[3] ? Number(m[3]) : new Date().getFullYear();
  if (y < 100) y += 2000;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

async function pdfLines(file: File): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist");
  // Воркер лежить готовим файлом у public/ (копія node_modules/pdfjs-dist/build/pdf.worker.min.mjs
  // тієї ж версії 4.4.168) — збірщик Next не вміє його стискати.
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const lines: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    // Клітинки таблиці — окремі шматки тексту: збираємо в рядки за вертикаллю.
    const rows: { y: number; items: { x: number; s: string }[] }[] = [];
    for (const it of content.items as { str: string; transform: number[] }[]) {
      if (!it.str?.trim()) continue;
      const [, , , , x, y] = it.transform;
      const row = rows.find((r) => Math.abs(r.y - y) < 3);
      if (row) row.items.push({ x, s: it.str });
      else rows.push({ y, items: [{ x, s: it.str }] });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) lines.push(r.items.sort((a, b) => a.x - b.x).map((i) => i.s.trim()).join(" "));
  }
  return lines;
}

async function csvLines(file: File): Promise<string[]> {
  const text = await file.text();
  const sep = (text.split("\n")[0].match(/;/g)?.length ?? 0) > (text.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  return text.split(/\r?\n/).map((l) => l.split(sep).map((c) => c.replace(/^"|"$/g, "").trim()).join(" "));
}

/** Часові групи за перервами в розкладі: 10:00…10:42 | 11:30…12:12 | 13:00…13:42. */
function inferGroups(rows: Row[]): TimeGroup[] {
  const times = [...new Set(rows.map((r) => r.shootTime).filter((t): t is string => !!t))].map(minutes).sort((a, b) => a - b);
  if (times.length < 2) return [];
  const diffs = times.slice(1).map((t, i) => t - times[i]);
  const counts = new Map<number, number>();
  diffs.forEach((d) => counts.set(d, (counts.get(d) ?? 0) + 1));
  const step = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
  if (step < 1 || step > 240) return [];
  const blocks: number[][] = [[times[0]]];
  for (let i = 1; i < times.length; i++) {
    if (times[i] - times[i - 1] > step) blocks.push([times[i]]);
    else blocks[blocks.length - 1].push(times[i]);
  }
  return blocks.map((b, i) => ({
    id: "",
    name: defaultGroupName(i),
    color: GROUP_COLORS[i % GROUP_COLORS.length],
    start: fromMinutes(b[0]),
    end: fromMinutes(b[b.length - 1] + step),
    interval: step,
    count: b.length,
  }));
}

/**
 * «Додати дітей списком»: PDF (експорт Google-таблиці) або CSV з колонками
 * № · час · «Прізвище Ім'я». Спершу — перегляд, потім додавання.
 */
export function ImportStudents({
  classId,
  hasTimeGroups,
  hasShootDate,
  onDone,
}: {
  classId: string;
  hasTimeGroups: boolean;
  hasShootDate: boolean;
  /** settingsChanged — створено часові групи / дату: батьківська сторінка має перечитати налаштування. */
  onDone: (settingsChanged: boolean) => Promise<unknown> | void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [fileName, setFileName] = useState("");
  const [makeGroups, setMakeGroups] = useState(true);
  const [setDate, setSetDate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string; details?: string[] } | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setMessage(null);
    setFileName(file.name);
    try {
      const lines = /\.pdf$/i.test(file.name) ? await pdfLines(file) : await csvLines(file);
      const rows = lines.map(parseLine).filter((r): r is Row => !!r);
      const date = lines.slice(0, 5).map(parseDate).find(Boolean) ?? null;
      if (!rows.length) {
        setParsed(null);
        setMessage({ type: "error", text: "У файлі не знайдено рядків «час · Прізвище Ім'я». Перевірте, що це експорт таблиці зі списком." });
        return;
      }
      setParsed({ rows, date });
    } catch (e) {
      setParsed(null);
      setMessage({ type: "error", text: `Не вдалося прочитати файл: ${e instanceof Error ? e.message : e}` });
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const groups = parsed ? inferGroups(parsed.rows) : [];

  async function save() {
    if (!parsed) return;
    setBusy(true);
    setMessage(null);
    try {
      const settings: Record<string, unknown> = {};
      if (!hasTimeGroups && makeGroups && groups.length) settings.timeGroups = groups.map(({ id: _id, ...g }) => g);
      if (!hasShootDate && setDate && parsed.date) settings.shootDate = parsed.date;
      const settingsChanged = Object.keys(settings).length > 0;
      if (settingsChanged) {
        const r = await fetch(`/api/classes/${classId}/settings`, { method: "PATCH", body: JSON.stringify(settings) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error ?? "Не вдалося зберегти часові групи");
      }
      const res = await fetch(`/api/classes/${classId}/students/import`, {
        method: "POST",
        body: JSON.stringify({ rows: parsed.rows }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Не вдалося додати дітей");
      const details = [
        ...(data.skipped ?? []).map((s: string) => `Уже є в класі: ${s}`),
        ...(data.timeTaken ?? []).map((s: string) => `Час уже зайнятий, додано без часу: ${s}`),
      ];
      setMessage({ type: "ok", text: `Додано дітей: ${data.added}.`, details });
      setParsed(null);
      await onDone(settingsChanged);
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Помилка" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-line p-3.5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-[13px] font-bold">
          <FileUp className="h-4 w-4 text-purple" /> Додати дітей списком
        </span>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-[9px] border-[1.5px] border-purple bg-purple-pale px-3 py-1.5 text-[12px] font-bold text-purple-deep hover:bg-purple-soft disabled:opacity-40"
        >
          Обрати файл PDF або CSV
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf,.csv,text/csv"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </div>
      <p className="text-[11px] text-ink-soft">
        Таблиця з колонками «№ · час · Прізвище та ім'я» (Google-таблиця → Файл → Завантажити → PDF або CSV). Дата
        зйомки береться із заголовка (напр. «21.11»), часові групи — за перервами в розкладі. Діти, які вже є в класі,
        пропускаються.
      </p>

      {parsed && (
        <div className="mt-3 rounded-[10px] border border-purple-soft bg-page p-3">
          <div className="mb-2 flex items-center justify-between gap-2 text-[12.5px]">
            <b>
              {fileName}: знайдено дітей — {parsed.rows.length}
            </b>
            <button onClick={() => setParsed(null)} className="text-ink-soft" aria-label="Скасувати">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-[260px] overflow-y-auto rounded-[8px] border border-line bg-card">
            <table className="w-full text-[12.5px]">
              <tbody>
                {parsed.rows.map((r, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td className="w-8 px-2 py-1 text-ink-soft">{i + 1}</td>
                    <td className="w-16 px-2 py-1 font-mono">{r.shootTime ?? "—"}</td>
                    <td className="px-2 py-1">
                      {r.lastName} {r.firstName}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-2.5 flex flex-col gap-1.5 text-[12px]">
            {!hasShootDate && parsed.date && (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={setDate} onChange={(e) => setSetDate(e.target.checked)} className="accent-purple" />
                Встановити дату зйомки: <b>{parsed.date.split("-").reverse().join(".")}</b>
              </label>
            )}
            {!hasTimeGroups && groups.length > 0 && (
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={makeGroups}
                  onChange={(e) => setMakeGroups(e.target.checked)}
                  className="mt-0.5 accent-purple"
                />
                <span>
                  Створити часові групи:{" "}
                  {groups.map((g, i) => (
                    <span key={i} className="mr-1.5 inline-flex items-center gap-1">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: g.color }} />
                      {g.name} {g.start}–{g.end} ({g.count} дітей, по {g.interval} хв)
                    </span>
                  ))}
                </span>
              </label>
            )}
            {hasTimeGroups && (
              <span className="text-ink-soft">Часові групи в класі вже є — їх не змінюємо, діти отримають час із файлу.</span>
            )}
          </div>

          <button
            onClick={save}
            disabled={busy}
            className="mt-3 rounded-[9px] bg-purple px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
          >
            {busy ? "Додаємо…" : `Додати ${parsed.rows.length} дітей`}
          </button>
        </div>
      )}

      {message && (
        <div className={`mt-2 text-[12.5px] font-semibold ${message.type === "ok" ? "text-ok" : "text-warn"}`}>
          {message.text}
          {message.details && message.details.length > 0 && (
            <ul className="ml-4 mt-1 list-disc font-normal text-ink-soft">
              {message.details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
