"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Card } from "@otak/ui";
import { createSupabaseBrowserClient } from "@otak/supabase/browser";
import { classChannel, type Question } from "@otak/supabase/cabinet";
import { CalendarDays, Check, Clock, Images, Lock, Users } from "lucide-react";
import { redirectToLogin } from "@/lib/session-redirect";

type Row = {
  id: string;
  name: string;
  staffRole: string | null;
  shootTime: string | null;
  answers: Record<string, string>;
  photos: Record<string, string[]>;
};

type CabinetData = {
  meId: string;
  class: { id: string; name: string; school: string; shootDate: string | null; editingEnabled: boolean };
  slots: string[];
  taken: Record<string, string>;
  questions: Question[];
  photoSlots: { id: string; label: string }[];
  hasPhotos: boolean;
  rows: Row[];
};

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("uk-UA", { day: "numeric", month: "long", year: "numeric" });
}

export default function CabinetPage() {
  const [data, setData] = useState<CabinetData | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [timeBusy, setTimeBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  async function load() {
    const res = await fetch("/api/cabinet", { cache: "no-store" });
    if (res.status === 401) return redirectToLogin();
    const next: CabinetData = await res.json();
    setData(next);
    // Чужі зміни не перетирають те, що людина саме зараз друкує.
    if (!dirtyRef.current) setDrafts(next.rows.find((r) => r.id === next.meId)?.answers ?? {});
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime: будь-яка зміна в групі (інші батьки, адмін) — перезапит без перезавантаження.
  const classId = data?.class.id;
  useEffect(() => {
    if (!classId) return;
    const supabase = createSupabaseBrowserClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel(classChannel(classId))
      .on("broadcast", { event: "changed" }, () => {
        clearTimeout(timer);
        timer = setTimeout(load, 300);
      })
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  if (!data) return <p className="text-sm text-ink-soft">Завантажуємо…</p>;

  const me = data.rows.find((r) => r.id === data.meId);
  const canEdit = data.class.editingEnabled;

  async function put(body: Record<string, unknown>) {
    const res = await fetch("/api/cabinet", { method: "PUT", body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (res.status === 401) redirectToLogin();
    return res.ok ? null : ((json.error as string) ?? "Не вдалося зберегти");
  }

  async function pickTime(time: string | null) {
    setError(null);
    setTimeBusy(time ?? "clear");
    const err = await put({ shootTime: time });
    setTimeBusy(null);
    if (err) setError(err);
    await load();
  }

  async function saveAnswers(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaveState("saving");
    const err = await put({ answers: drafts });
    if (err) {
      setError(err);
      setSaveState("idle");
      return;
    }
    setDirty(false);
    dirtyRef.current = false;
    setSaveState("saved");
    await load();
    setTimeout(() => setSaveState("idle"), 2000);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold">
          {data.class.name}
          {data.class.school ? `, ${data.class.school}` : ""}
        </h1>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-soft">
          <CalendarDays className="h-3.5 w-3.5" />
          {data.class.shootDate ? `Фотосесія ${formatDate(data.class.shootDate)}` : "Дату фотосесії ще не призначено"}
        </p>
      </div>

      {!canEdit && (
        <p className="flex items-start gap-2 rounded-[10px] bg-purple-pale p-3 text-xs text-purple-deep">
          <Lock className="mt-px h-3.5 w-3.5 flex-shrink-0" />
          Редагування закрите — дані можна лише переглянути. Якщо щось треба виправити, напишіть фотографу.
        </p>
      )}

      {me && (
        <Card title={me.name} menu={false}>
          {/* Час зйомки */}
          {!me.staffRole && (
            <div className="mb-4">
              <div className="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold">
                <Clock className="h-4 w-4 text-purple" />
                {me.shootTime ? `Ваш час: ${me.shootTime}` : "Оберіть час фотосесії"}
              </div>
              {data.slots.length === 0 ? (
                <p className="text-xs text-ink-soft">Час ще не відкрито для вибору — фотограф додасть його згодом.</p>
              ) : (
                <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
                  {data.slots.map((t) => {
                    const owner = data.taken[t];
                    const mine = owner === data.meId;
                    const busy = !!owner && !mine;
                    return (
                      <button
                        key={t}
                        disabled={!canEdit || busy || mine || timeBusy !== null}
                        onClick={() => pickTime(t)}
                        className={`rounded-[8px] border px-1 py-2 text-[12.5px] font-semibold transition-colors ${
                          mine
                            ? "border-purple bg-purple text-white"
                            : busy
                              ? "cursor-not-allowed border-line bg-page text-ink-soft/50 line-through"
                              : "border-line bg-card text-ink hover:border-purple disabled:opacity-60"
                        }`}
                      >
                        {timeBusy === t ? "…" : t}
                      </button>
                    );
                  })}
                </div>
              )}
              {me.shootTime && canEdit && data.slots.includes(me.shootTime) && (
                <button
                  onClick={() => pickTime(null)}
                  disabled={timeBusy !== null}
                  className="mt-2 text-[11.5px] text-ink-soft hover:text-warn hover:underline"
                >
                  Звільнити мій час
                </button>
              )}
            </div>
          )}

          {/* Анкета */}
          {data.questions.length > 0 && (
            <form onSubmit={saveAnswers} className="flex flex-col gap-3">
              {data.questions.map((q) => (
                <label key={q.key} className="block">
                  <span className="mb-1 block text-[12px] font-semibold text-ink-soft">{q.label}</span>
                  <textarea
                    value={drafts[q.key] ?? ""}
                    disabled={!canEdit}
                    onChange={(e) => {
                      setDrafts((prev) => ({ ...prev, [q.key]: e.target.value }));
                      setDirty(true);
                    }}
                    rows={2}
                    className="w-full rounded-[9px] border border-line bg-page px-3 py-2 text-[14px] outline-none focus:border-purple focus:bg-white disabled:opacity-70"
                  />
                </label>
              ))}
              {canEdit && (
                <Button type="submit" disabled={saveState === "saving" || !dirty} className="sm:w-auto">
                  {saveState === "saving" ? (
                    "Зберігаємо…"
                  ) : saveState === "saved" ? (
                    <>
                      <Check className="h-4 w-4" /> Збережено
                    </>
                  ) : (
                    "Зберегти"
                  )}
                </Button>
              )}
            </form>
          )}

          {data.photoSlots.length > 0 && (
            <div className="mt-4 border-t border-line pt-3.5">
              {data.hasPhotos ? (
                <a href="/album" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-purple hover:underline">
                  <Images className="h-4 w-4" /> Обрати фото для альбому
                </a>
              ) : (
                <p className="text-xs text-ink-soft">Фото для альбому можна буде обрати після фотосесії.</p>
              )}
            </div>
          )}

          {error && <p className="mt-3 text-[12.5px] font-semibold text-warn">{error}</p>}
        </Card>
      )}

      {/* Уся група — лише перегляд */}
      <Card
        title={
          <span className="inline-flex items-center gap-1.5">
            <Users className="h-4 w-4" /> Уся група
          </span>
        }
        menu={false}
      >
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="min-w-max border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b-[1.5px] border-line text-left text-[11px] font-bold text-ink-soft">
                <th className="py-2 pr-3">Час</th>
                <th className="sticky left-0 z-10 bg-card py-2 pr-4">Прізвище та ім'я</th>
                {data.photoSlots.map((s) => (
                  <th key={s.id} className="whitespace-nowrap px-3 py-2">
                    {s.label}
                  </th>
                ))}
                {data.questions.map((q) => (
                  <th key={q.key} className="whitespace-nowrap px-3 py-2">
                    {q.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => {
                const mine = r.id === data.meId;
                const bg = mine ? "bg-purple-pale" : "bg-card";
                return (
                  <tr key={r.id} className={`border-b border-line align-top ${mine ? "bg-purple-pale" : ""}`}>
                    <td className="whitespace-nowrap py-2.5 pr-3 font-semibold">{r.shootTime ?? "—"}</td>
                    <td className={`sticky left-0 z-10 whitespace-nowrap py-2.5 pr-4 font-semibold ${bg}`}>
                      {r.name}
                      {r.staffRole && (
                        <span className="ml-1.5 rounded-full bg-line px-1.5 py-0.5 text-[9.5px] font-bold text-ink-soft">
                          {r.staffRole}
                        </span>
                      )}
                      {mine && <span className="ml-1.5 text-[10px] font-bold text-purple">ви</span>}
                    </td>
                    {data.photoSlots.map((s) => (
                      <td key={s.id} className="max-w-[160px] px-3 py-2.5 font-mono text-[11px] text-ink-soft">
                        {(r.photos[s.id] ?? []).join(", ") || "—"}
                      </td>
                    ))}
                    {data.questions.map((q) => (
                      <td key={q.key} className="min-w-[140px] max-w-[220px] px-3 py-2.5">
                        {r.answers[q.key]?.trim() || <span className="text-ink-soft">—</span>}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
