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

/** Слоти від start до end (включно, якщо влазить) з кроком interval хвилин. */
export function generateSlots(start: string | null, end: string | null, intervalMin: number): string[] {
  if (!start || !end || !intervalMin || intervalMin < 1) return [];
  const from = toMinutes(start);
  const to = toMinutes(end);
  const slots: string[] = [];
  for (let t = from; t <= to && slots.length < 500; t += intervalMin) {
    slots.push(`${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`);
  }
  return slots;
}
