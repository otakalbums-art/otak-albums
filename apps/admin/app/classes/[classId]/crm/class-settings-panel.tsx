"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Toggle } from "@otak/ui";
import {
  GROUP_COLORS,
  KINDERGARTEN_QUESTIONS,
  defaultGroupName,
  groupSlots,
  type Question,
  type TimeGroup,
} from "@otak/supabase/cabinet";
import { BookImage, CalendarDays, ListChecks, Lock, Plus, X } from "lucide-react";

export type ClassSettings = {
  id: string;
  album_type_id: string | null;
  shoot_date: string | null;
  time_groups: TimeGroup[];
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
  const [groups, setGroups] = useState<TimeGroup[]>(settings.time_groups);
  const [editing, setEditing] = useState(settings.parent_editing_enabled);
  const [questions, setQuestions] = useState<Question[]>(settings.questions);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // Після збереження сервер віддає нові значення (напр. ключі нових питань) — підхоплюємо їх.
  const settingsKey = JSON.stringify(settings);
  useEffect(() => {
    setDate(settings.shoot_date ?? "");
    setGroups(settings.time_groups);
    setEditing(settings.parent_editing_enabled);
    setQuestions(settings.questions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsKey]);

  const scheduleDirty =
    date !== (settings.shoot_date ?? "") || JSON.stringify(groups) !== JSON.stringify(settings.time_groups);
  const questionsDirty = JSON.stringify(questions) !== JSON.stringify(settings.questions);

  function updateGroup(i: number, patch: Partial<TimeGroup>) {
    setGroups((prev) => prev.map((g, idx) => (idx === i ? { ...g, ...patch } : g)));
  }

  /** Нова група починається там, де закінчилась попередня, з тим самим кроком. */
  function addGroup() {
    setGroups((prev) => {
      const last = prev[prev.length - 1];
      const start = last?.end ?? "16:00";
      const [h, m] = start.split(":").map(Number);
      const endMin = Math.min(h * 60 + m + 20, 23 * 60 + 59);
      const end = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
      return [
        ...prev,
        { id: "", name: "", color: GROUP_COLORS[prev.length % GROUP_COLORS.length], start, end, interval: last?.interval ?? 5 },
      ];
    });
  }

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
    <div className="mb-5 grid gap-3.5 lg:grid-cols-2">
      <label className="flex flex-wrap items-center gap-2 text-xs font-semibold lg:col-span-2">
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
      {/* Дата і часові групи */}
      <section className="rounded-xl border border-line p-3.5 lg:col-span-2">
        <h4 className="mb-2.5 flex items-center gap-1.5 text-[13px] font-bold">
          <CalendarDays className="h-4 w-4 text-purple" /> Зйомка і часові групи
        </h4>
        <label className="block max-w-[220px] text-[10.5px] text-ink-soft">
          Дата зйомки
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${input} mt-0.5 w-full`} />
        </label>

        <div className="mt-3 flex flex-col gap-2">
          {groups.map((g, i) => {
            const count = groupSlots(g).length;
            return (
              <div
                key={i}
                className="flex flex-wrap items-end gap-2 rounded-[10px] border border-line border-l-4 p-2.5"
                style={{ borderLeftColor: g.color }}
              >
                <label className="text-[10.5px] text-ink-soft">
                  Колір
                  <input
                    type="color"
                    value={g.color}
                    onChange={(e) => updateGroup(i, { color: e.target.value })}
                    className="mt-0.5 block h-[30px] w-[42px] cursor-pointer rounded-[8px] border border-line bg-white p-0.5"
                  />
                </label>
                <label className="min-w-[130px] flex-1 text-[10.5px] text-ink-soft">
                  Назва
                  <input
                    value={g.name}
                    onChange={(e) => updateGroup(i, { name: e.target.value })}
                    placeholder={defaultGroupName(i)}
                    className={`${input} mt-0.5 w-full`}
                  />
                </label>
                <label className="text-[10.5px] text-ink-soft">
                  Від
                  <input type="time" value={g.start} onChange={(e) => updateGroup(i, { start: e.target.value })} className={`${input} mt-0.5 block`} />
                </label>
                <label className="text-[10.5px] text-ink-soft">
                  До
                  <input type="time" value={g.end} onChange={(e) => updateGroup(i, { end: e.target.value })} className={`${input} mt-0.5 block`} />
                </label>
                <label className="text-[10.5px] text-ink-soft">
                  Хв на дитину
                  <input
                    type="number"
                    min={1}
                    max={240}
                    value={g.interval}
                    onChange={(e) => updateGroup(i, { interval: Number(e.target.value) })}
                    className={`${input} mt-0.5 block w-[86px]`}
                  />
                </label>
                <span className="pb-1.5 text-[11.5px] font-bold" style={{ color: g.color }}>
                  {count} {count === 1 ? "дитина" : count >= 2 && count <= 4 ? "дитини" : "дітей"}
                </span>
                <button
                  onClick={() => setGroups((prev) => prev.filter((_, idx) => idx !== i))}
                  aria-label="Прибрати групу"
                  className="ml-auto pb-1.5 text-ink-soft hover:text-warn"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
          {groups.length === 0 && (
            <p className="text-[11px] text-ink-soft">
              Додайте часову групу — батьки зможуть обрати час у межах її проміжку.
            </p>
          )}
          <div>
            <Button size="sm" variant="ghost" onClick={addGroup}>
              <Plus className="h-3.5 w-3.5" /> Часова група
            </Button>
          </div>
        </div>
        <p className="mt-2 text-[10.5px] text-ink-soft">
          Слоти — від «Від» до «До» (не включно) з кроком «Хв на дитину». Напр. 16:00–16:20 по 5 хв = 4 дитини.
          Без назви група стане «Група 1», «Група 2»…
        </p>
        {scheduleDirty && (
          <Button
            size="sm"
            className="mt-2"
            disabled={busy !== null}
            onClick={() =>
              run(
                "schedule",
                { shootDate: date || null, timeGroups: groups },
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
        <p className={`text-xs font-semibold lg:col-span-2 ${message.ok ? "text-ok" : "text-warn"}`}>{message.text}</p>
      )}
    </div>
  );
}
