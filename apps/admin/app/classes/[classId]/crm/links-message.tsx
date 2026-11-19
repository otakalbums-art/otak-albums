"use client";

import { useState } from "react";
import { Check, Copy, MessageSquareText, X } from "lucide-react";
import { groupForTime, type TimeGroup } from "@otak/supabase/cabinet";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

type LinkStudent = {
  first_name: string;
  last_name: string;
  is_staff: boolean;
  staff_role: string | null;
  shoot_time: string | null;
  access_token: string;
};

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(`${iso}T00:00:00`).toLocaleDateString("uk-UA", { day: "numeric", month: "long", year: "numeric" });
}

function byTimeThenName(a: LinkStudent, b: LinkStudent) {
  if (a.shoot_time && b.shoot_time && a.shoot_time !== b.shoot_time) return a.shoot_time.localeCompare(b.shoot_time);
  if (!!a.shoot_time !== !!b.shoot_time) return a.shoot_time ? -1 : 1;
  return `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`, "uk");
}

function line(s: LinkStudent, i: number) {
  const time = s.shoot_time ? ` (${s.shoot_time})` : "";
  const role = s.staff_role ? ` — ${s.staff_role}` : "";
  return `${i + 1}. ${s.last_name} ${s.first_name}${role}${time} — ${SITE_URL}/k/${s.access_token}`;
}

/**
 * Готове повідомлення для відповідальної особи групи: список дітей з
 * персональними посиланнями — увесь клас/група або окрема часова група.
 * Адмін копіює текст і пересилає в месенджер.
 */
export function LinksMessage({
  students,
  timeGroups,
  title,
  shootDate,
}: {
  students: LinkStudent[];
  timeGroups: TimeGroup[];
  title: string;
  shootDate: string | null;
}) {
  const [text, setText] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [copied, setCopied] = useState(false);

  const children = students.filter((s) => !s.is_staff).sort(byTimeThenName);
  const staff = students.filter((s) => s.is_staff).sort(byTimeThenName);
  const date = formatDate(shootDate);
  const intro = [
    `${title} — персональні посилання для батьків`,
    date ? `Фотосесія: ${date}` : null,
    "За своїм посиланням можна обрати час, заповнити анкету й пізніше переглянути фото.",
  ]
    .filter(Boolean)
    .join("\n");

  function open(nextLabel: string, body: string) {
    setLabel(nextLabel);
    setText(`${intro}\n\n${body}`);
    setCopied(false);
  }

  function openAll() {
    const parts = [children.map(line).join("\n")];
    if (staff.length) parts.push(`Персонал:\n${staff.map(line).join("\n")}`);
    open("Весь список", parts.join("\n\n"));
  }

  function openGroup(g: TimeGroup) {
    const list = children.filter((s) => groupForTime(timeGroups, s.shoot_time)?.id === g.id);
    open(g.name, `${g.name} (${g.start}–${g.end}):\n${list.map(line).join("\n")}`);
  }

  async function copy() {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const btn =
    "inline-flex items-center gap-1.5 rounded-[9px] border-[1.5px] px-3 py-1.5 text-[12px] font-bold transition-colors disabled:opacity-40";

  return (
    <div className="mb-4 rounded-xl border border-line p-3.5">
      <div className="mb-2.5 flex items-center gap-1.5 text-[13px] font-bold">
        <MessageSquareText className="h-4 w-4 text-purple" /> Повідомлення з посиланнями
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={openAll}
          disabled={!students.length}
          className={`${btn} border-purple bg-purple-pale text-purple-deep hover:bg-purple-soft`}
        >
          Весь список · {children.length}
        </button>
        {timeGroups.map((g) => {
          const count = children.filter((s) => groupForTime(timeGroups, s.shoot_time)?.id === g.id).length;
          return (
            <button
              key={g.id}
              onClick={() => openGroup(g)}
              disabled={!count}
              className={`${btn} text-ink hover:brightness-95`}
              style={{ borderColor: g.color, background: `${g.color}1F` }}
              title={count ? undefined : "У цій групі ще немає дітей"}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: g.color }} />
              {g.name} · {count}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[10.5px] text-ink-soft">
        Формує готовий текст зі списком дітей і їхніми персональними посиланнями — скопіюйте й надішліть
        відповідальній особі в месенджер. У групу потрапляють діти, чий час входить у її проміжок.
      </p>

      {text !== null && (
        <div className="mt-3 rounded-[10px] border border-line bg-page p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[12px] font-bold">{label}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={copy}
                className="inline-flex items-center gap-1.5 rounded-[8px] bg-purple px-3 py-1.5 text-[12px] font-bold text-white hover:bg-purple-deep"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Скопійовано" : "Копіювати повідомлення"}
              </button>
              <button onClick={() => setText(null)} aria-label="Закрити" className="text-ink-soft hover:text-warn">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          {/* Текст можна підправити перед копіюванням. */}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={Math.min(18, text.split("\n").length + 1)}
            className="w-full rounded-[8px] border border-line bg-white px-2.5 py-2 font-mono text-[11.5px] leading-relaxed outline-none focus:border-purple"
          />
        </div>
      )}
    </div>
  );
}
