/**
 * Спільне для особистого кабінету дитини (apps/client/app/cabinet) і CRM
 * адмінки: realtime-сповіщення про зміни в класі, часові слоти, анкета.
 * supabase/migrations/0013_parent_cabinet.sql
 */

export type Question = { key: string; label: string };

/** Анкета садочка — як у спільній Google-таблиці групи. */
export const KINDERGARTEN_QUESTIONS: Question[] = [
  { key: "dream", label: "Моя мрія" },
  { key: "career", label: "Ким хочу стати" },
  { key: "color", label: "Улюблений колір" },
  { key: "food", label: "Улюблена страва" },
  { key: "hobby", label: "Моє хобі" },
];

export function parseQuestions(raw: unknown): Question[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((q) => q && typeof q.key === "string" && typeof q.label === "string" && q.label.trim())
    .map((q) => ({ key: q.key, label: q.label.trim() }));
}

/** Канал realtime класу: і адмінська CRM, і кабінети батьків слухають його й перезапитують дані. */
export function classChannel(classId: string) {
  return `class-${classId}`;
}

/**
 * Повідомити всіх, хто дивиться клас, що дані змінились (без самих даних —
 * клієнти перезапитують їх через свої API з перевіркою доступу).
 * Помилки не прокидаємо: сама зміна вже збережена.
 */
export async function broadcastClassChange(classId: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ topic: classChannel(classId), event: "changed", payload: {} }] }),
      cache: "no-store",
    });
  } catch (err) {
    console.error("[realtime] broadcast failed:", err);
  }
}

/** "14:07:00" | "14:07" -> "14:07" */
export function hhmm(time: string | null | undefined) {
  return time ? time.slice(0, 5) : null;
}

function toMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function toHHMM(t: number) {
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

// --- Часові групи (supabase/migrations/0014_time_groups.sql) ------------------

export type TimeGroup = { id: string; name: string; color: string; start: string; end: string; interval: number };

/** Кольори для нових груп по черзі — добре читаються і з білим текстом. */
export const GROUP_COLORS = ["#8C57A8", "#2F80ED", "#27AE60", "#F2994A", "#EB5757", "#00A3A3", "#C2185B", "#6D4C41"];

const TIME_RE = /^\d{2}:\d{2}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export function defaultGroupName(index: number) {
  return `Група ${index + 1}`;
}

/** Нормалізує групи з БД/запиту: відкидає зламані, підставляє назву й колір за замовчуванням. */
export function parseTimeGroups(raw: unknown): TimeGroup[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((g) => g && TIME_RE.test(g.start) && TIME_RE.test(g.end) && Number(g.interval) >= 1)
    .map((g, i) => ({
      id: typeof g.id === "string" && g.id ? g.id : `g${i + 1}`,
      name: typeof g.name === "string" && g.name.trim() ? g.name.trim() : defaultGroupName(i),
      color: COLOR_RE.test(g.color) ? g.color : GROUP_COLORS[i % GROUP_COLORS.length],
      start: g.start,
      end: g.end,
      interval: Math.min(240, Math.round(Number(g.interval))),
    }));
}

/** Слоти групи: від start (вкл.) до end (не вкл.) з кроком interval. */
export function groupSlots(group: Pick<TimeGroup, "start" | "end" | "interval">): string[] {
  if (!TIME_RE.test(group.start) || !TIME_RE.test(group.end) || !(group.interval >= 1)) return [];
  const slots: string[] = [];
  for (let t = toMinutes(group.start); t < toMinutes(group.end) && slots.length < 300; t += group.interval) {
    slots.push(toHHMM(t));
  }
  return slots;
}

/** Усі слоти всіх груп по порядку, без дублів (перетин груп — слот належить першій). */
export function allSlots(groups: TimeGroup[]): { time: string; groupId: string }[] {
  const seen = new Set<string>();
  const out: { time: string; groupId: string }[] = [];
  for (const g of groups) {
    for (const time of groupSlots(g)) {
      if (seen.has(time)) continue;
      seen.add(time);
      out.push({ time, groupId: g.id });
    }
  }
  return out.sort((a, b) => a.time.localeCompare(b.time));
}

/** Група, в чий проміжок потрапляє час (навіть якщо адмін поставив його поза сіткою). */
export function groupForTime(groups: TimeGroup[], time: string | null): TimeGroup | null {
  if (!time) return null;
  const t = toMinutes(time);
  return groups.find((g) => t >= toMinutes(g.start) && t < toMinutes(g.end)) ?? null;
}
