"use client";

import { useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { groupForTime, type Question, type TimeGroup } from "@otak/supabase/cabinet";

export type GroupRow = {
  id: string;
  name: string;
  staffRole: string | null;
  shootTime: string | null;
  answers: Record<string, string>;
  photos: Record<string, string[]>;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

/**
 * Група на телефоні: розклад картками замість широкої таблиці. Картка —
 * час, ім'я і перша заповнена відповідь; дотик розгортає всю анкету.
 */
export function GroupList({
  rows,
  meId,
  questions,
  photoSlots,
  timeGroups,
}: {
  rows: GroupRow[];
  meId: string;
  questions: Question[];
  photoSlots: { id: string; label: string }[];
  timeGroups: TimeGroup[];
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const visible = q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
  const scheduled = visible.filter((r) => !r.staffRole && r.shootTime);
  // Розклад розбитий на часові групи; час поза групами (поставив адмін) — окремо.
  const byGroup = timeGroups.map((g) => ({ g, items: scheduled.filter((r) => groupForTime(timeGroups, r.shootTime)?.id === g.id) }));
  const outside = scheduled.filter((r) => !groupForTime(timeGroups, r.shootTime));
  const unscheduled = visible.filter((r) => !r.staffRole && !r.shootTime);
  const staff = visible.filter((r) => r.staffRole);

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function Item({ r }: { r: GroupRow }) {
    const mine = r.id === meId;
    const expanded = open.has(r.id);
    const firstAnswer = questions.find((x) => r.answers[x.key]?.trim());
    const filled = questions.filter((x) => r.answers[x.key]?.trim()).length;
    const group = groupForTime(timeGroups, r.shootTime);

    return (
      <li
        className={`overflow-hidden rounded-[14px] border transition-colors ${
          mine ? "border-purple bg-purple-pale/60" : "border-line bg-card"
        }`}
      >
        <button onClick={() => toggle(r.id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
          <span
            className={`flex h-11 w-14 flex-shrink-0 flex-col items-center justify-center rounded-[10px] text-[13px] font-extrabold ${
              r.shootTime ? "bg-purple text-white" : "bg-line text-ink-soft"
            }`}
            style={group ? { background: group.color } : undefined}
          >
            {r.staffRole ? initials(r.name) : (r.shootTime ?? "—")}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-[14px] font-bold">{r.name}</span>
              {mine && <span className="rounded-full bg-purple px-1.5 py-px text-[9.5px] font-bold text-white">ви</span>}
            </span>
            <span className="block truncate text-[11.5px] text-ink-soft">
              {r.staffRole
                ? r.staffRole
                : firstAnswer
                  ? `${firstAnswer.label}: ${r.answers[firstAnswer.key]}`
                  : questions.length
                    ? "Анкету ще не заповнено"
                    : ""}
            </span>
          </span>
          {questions.length > 0 && !r.staffRole && (
            <span className="flex flex-shrink-0 items-center gap-1 text-[10.5px] font-semibold text-ink-soft">
              {filled}/{questions.length}
              <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
            </span>
          )}
        </button>

        {expanded && (
          <dl className="grid gap-2 border-t border-line/70 px-3.5 pb-3 pt-2.5">
            {questions.map((x) => (
              <div key={x.key}>
                <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-soft">{x.label}</dt>
                <dd className="text-[13.5px]">{r.answers[x.key]?.trim() || <span className="text-ink-soft">—</span>}</dd>
              </div>
            ))}
            {photoSlots.map((s) =>
              (r.photos[s.id] ?? []).length ? (
                <div key={s.id}>
                  <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-soft">{s.label}</dt>
                  <dd className="font-mono text-[12px]">{r.photos[s.id].join(", ")}</dd>
                </div>
              ) : null
            )}
          </dl>
        )}
      </li>
    );
  }

  function Section({ title, items, color, hint }: { title: string; items: GroupRow[]; color?: string; hint?: string }) {
    if (!items.length) return null;
    return (
      <section>
        <h3 className="mb-2 mt-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-soft">
          {color && <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />}
          <span style={color ? { color } : undefined}>{title}</span> · {items.length}
          {hint && <span className="font-semibold normal-case tracking-normal">· {hint}</span>}
        </h3>
        <ul className="flex flex-col gap-2">
          {items.map((r) => (
            <Item key={r.id} r={r} />
          ))}
        </ul>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 rounded-[11px] border border-line bg-page px-3 py-2">
        <Search className="h-4 w-4 flex-shrink-0 text-ink-soft" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Знайти дитину"
          className="w-full bg-transparent text-[14px] outline-none"
        />
      </label>
      {byGroup.map(({ g, items }) => (
        <Section key={g.id} title={g.name} items={items} color={g.color} hint={`${g.start}–${g.end}`} />
      ))}
      <Section title={timeGroups.length ? "Інший час" : "Розклад"} items={outside} />
      <Section title="Час ще не обрано" items={unscheduled} />
      <Section title="Персонал" items={staff} />
      {visible.length === 0 && <p className="text-sm text-ink-soft">Нікого не знайдено.</p>}
    </div>
  );
}
