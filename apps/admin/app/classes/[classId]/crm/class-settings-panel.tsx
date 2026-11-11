"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Toggle } from "@otak/ui";
import { KINDERGARTEN_QUESTIONS, generateSlots, type Question } from "@otak/supabase/cabinet";
import { BookImage, CalendarDays, ListChecks, Lock, Plus, X } from "lucide-react";

export type ClassSettings = {
  id: string;
  album_type_id: string | null;
  shoot_date: string | null;
  slot_start: string | null;
  slot_end: string | null;
  slot_interval_min: number;
  parent_editing_enabled: boolean;
  questions: Question[];
};

const input = "rounded-[8px] border border-line px-2 py-1.5 text-xs outline-none focus:border-purple";

async function patchSettings(classId: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/classes/${classId}/settings`, { method: "PATCH", body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return res.ok ? null : ((data.error as string) ?? "Не вдалося зберегти");
}

/**
 * Налаштування кабінету батьків для класу/групи: дата зйомки, часові слоти,
 * дозвіл редагування, питання анкети. Зміни одразу видно батькам (realtime).
 */
type AlbumTypeOption = { id: string; name: string; category: string | null };

export function ClassSettingsPanel({ settings, albumTypes }: { settings: ClassSettings; albumTypes: AlbumTypeOption[] }) {
  const router = useRouter();
  const [date, setDate] = useState(settings.shoot_date ?? "");
  const [start, setStart] = useState(settings.slot_start?.slice(0, 5) ?? "");
  const [end, setEnd] = useState(settings.slot_end?.slice(0, 5) ?? "");
  const [interval, setIntervalMin] = useState(String(settings.slot_interval_min));
  const [editing, setEditing] = useState(settings.parent_editing_enabled);
  const [questions, setQuestions] = useState<Question[]>(settings.questions);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // Після збереження сервер віддає нові значення (напр. ключі нових питань) — підхоплюємо їх.
  const settingsKey = JSON.stringify(settings);
  useEffect(() => {
    setDate(settings.shoot_date ?? "");
    setStart(settings.slot_start?.slice(0, 5) ?? "");
    setEnd(settings.slot_end?.slice(0, 5) ?? "");
    setIntervalMin(String(settings.slot_interval_min));
    setEditing(settings.parent_editing_enabled);
    setQuestions(settings.questions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsKey]);

  const scheduleDirty =
    date !== (settings.shoot_date ?? "") ||
    start !== (settings.slot_start?.slice(0, 5) ?? "") ||
    end !== (settings.slot_end?.slice(0, 5) ?? "") ||
    interval !== String(settings.slot_interval_min);
  const questionsDirty = JSON.stringify(questions) !== JSON.stringify(settings.questions);
  const preview = generateSlots(start || null, end || null, Number(interval));

  async function run(key: string, body: Record<string, unknown>, okText: string) {
    setBusy(key);
    setMessage(null);
    const err = await patchSettings(settings.id, body);
    setBusy(null);
    setMessage(err ? { ok: false, text: err } : { ok: true, text: okText });
    if (!err) router.refresh();
    return err;
  }

  async function toggleEditing(next: boolean) {
    setEditing(next);
    const err = await run("editing", { parentEditingEnabled: next }, next ? "Редагування увімкнено" : "Редагування вимкнено");
    if (err) setEditing(!next);
  }

  return (
    <div className="mb-5 grid gap-3.5 lg:grid-cols-3">
      <label className="flex flex-wrap items-center gap-2 text-xs font-semibold lg:col-span-3">
        <BookImage className="h-4 w-4 text-purple" /> Тип альбому
        <select
          value={settings.album_type_id ?? ""}
          disabled={busy !== null}
          onChange={(e) => run("album", { albumTypeId: e.target.value || null }, "Тип альбому змінено")}
          className={`${input} min-w-[240px] font-normal`}
        >
          <option value="">— Ще не обрано —</option>
          {albumTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.category ? `${t.category} · ${t.name}` : t.name}
            </option>
          ))}
        </select>
      </label>
      {/* Дата і слоти */}
      <section className="rounded-xl border border-line p-3.5">
        <h4 className="mb-2.5 flex items-center gap-1.5 text-[13px] font-bold">
          <CalendarDays className="h-4 w-4 text-purple" /> Зйомка і час
        </h4>
        <div className="grid grid-cols-2 gap-2">
          <label className="col-span-2 text-[10.5px] text-ink-soft">
            Дата зйомки
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${input} mt-0.5 w-full`} />
          </label>
          <label className="text-[10.5px] text-ink-soft">
            Перший слот
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className={`${input} mt-0.5 w-full`} />
          </label>
          <label className="text-[10.5px] text-ink-soft">
            Останній слот
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={`${input} mt-0.5 w-full`} />
          </label>
          <label className="col-span-2 text-[10.5px] text-ink-soft">
            Хвилин між дітьми
            <input
              type="number"
              min={1}
              max={240}
              value={interval}
              onChange={(e) => setIntervalMin(e.target.value)}
              className={`${input} mt-0.5 w-full`}
            />
          </label>
        </div>
        <p className="mt-2 text-[10.5px] text-ink-soft">
          {preview.length > 0
            ? `${preview.length} слотів: ${preview.slice(0, 4).join(", ")}${preview.length > 4 ? ` … ${preview[preview.length - 1]}` : ""}`
            : "Задайте перший і останній слот — батьки зможуть обрати час."}
        </p>
        {scheduleDirty && (
          <Button
            size="sm"
            className="mt-2"
            disabled={busy !== null}
            onClick={() =>
              run(
                "schedule",
                { shootDate: date || null, slotStart: start || null, slotEnd: end || null, slotIntervalMin: Number(interval) },
                "Розклад збережено"
              )
            }
          >
            {busy === "schedule" ? "Зберігаємо…" : "Зберегти розклад"}
          </Button>
        )}
      </section>

      {/* Дозвіл редагування */}
      <section className="rounded-xl border border-line p-3.5">
        <h4 className="mb-2.5 flex items-center gap-1.5 text-[13px] font-bold">
          <Lock className="h-4 w-4 text-purple" /> Редагування батьками
        </h4>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs">{editing ? "Батьки можуть змінювати свої дані" : "Лише перегляд — зміни заблоковано"}</span>
          <Toggle checked={editing} onChange={toggleEditing} disabled={busy !== null} aria-label="Дозволити редагування батькам" />
        </div>
        <p className="mt-2 text-[10.5px] text-ink-soft">
          Кожна дитина має персональне посилання — кнопка «Посилання» біля імені в таблиці нижче.
          Воно діє, доки дитину не видалили з класу.
        </p>
      </section>

      {/* Анкета */}
      <section className="rounded-xl border border-line p-3.5">
        <h4 className="mb-2.5 flex items-center gap-1.5 text-[13px] font-bold">
          <ListChecks className="h-4 w-4 text-purple" /> Анкета для батьків
        </h4>
        {questions.length === 0 ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-xs text-ink-soft">Анкети немає. Можна взяти питання садочка або додати свої.</p>
            <Button size="sm" variant="ghost" onClick={() => setQuestions(KINDERGARTEN_QUESTIONS)}>
              Питання садочка
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {questions.map((q, i) => (
              <div key={q.key || i} className="flex items-center gap-1.5">
                <input
                  value={q.label}
                  onChange={(e) => setQuestions((prev) => prev.map((x, idx) => (idx === i ? { ...x, label: e.target.value } : x)))}
                  className={`${input} flex-1`}
                />
                <button
                  onClick={() => setQuestions((prev) => prev.filter((_, idx) => idx !== i))}
                  aria-label="Прибрати питання"
                  className="text-ink-soft hover:text-warn"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" onClick={() => setQuestions((prev) => [...prev, { key: "", label: "Нове питання" }])}>
            <Plus className="h-3.5 w-3.5" /> Питання
          </Button>
          {questionsDirty && (
            <Button
              size="sm"
              disabled={busy !== null || questions.some((q) => !q.label.trim())}
              onClick={() => run("questions", { questions }, "Анкету збережено")}
            >
              {busy === "questions" ? "Зберігаємо…" : "Зберегти анкету"}
            </Button>
          )}
        </div>
        <p className="mt-2 text-[10.5px] text-ink-soft">
          Перейменування питання зберігає вже внесені відповіді; видалення питання ховає його відповіді.
        </p>
      </section>

      {message && (
        <p className={`text-xs font-semibold lg:col-span-3 ${message.ok ? "text-ok" : "text-warn"}`}>{message.text}</p>
      )}
    </div>
  );
}
