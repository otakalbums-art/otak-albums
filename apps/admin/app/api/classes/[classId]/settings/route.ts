import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { broadcastClassChange, parseQuestions } from "@otak/supabase/cabinet";
import { requireAdmin } from "@/lib/require-admin";
import { slotKeySlug } from "@/lib/slugify";

const TIME_RE = /^\d{2}:\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * PATCH /api/classes/[classId]/settings — налаштування кабінету батьків.
 * Body (усі поля необов'язкові): { shootDate, slotStart, slotEnd, slotIntervalMin,
 *   parentEditingEnabled, questions: [{key?, label}], albumTypeId }
 */
export async function PATCH(req: Request, { params }: { params: { classId: string } }) {
  const user = await requireAdmin(["crm", "classes"]);
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const body = await req.json();
  const update: Record<string, unknown> = {};

  if (body.shootDate !== undefined) {
    if (body.shootDate && !DATE_RE.test(body.shootDate)) return NextResponse.json({ error: "Невірна дата" }, { status: 400 });
    update.shoot_date = body.shootDate || null;
  }
  for (const [field, column] of [
    ["slotStart", "slot_start"],
    ["slotEnd", "slot_end"],
  ] as const) {
    if (body[field] === undefined) continue;
    if (body[field] && !TIME_RE.test(body[field])) return NextResponse.json({ error: "Невірний час" }, { status: 400 });
    update[column] = body[field] || null;
  }
  if (body.slotIntervalMin !== undefined) {
    const n = Number(body.slotIntervalMin);
    if (!Number.isInteger(n) || n < 1 || n > 240) {
      return NextResponse.json({ error: "Проміжок — від 1 до 240 хвилин" }, { status: 400 });
    }
    update.slot_interval_min = n;
  }
  if (body.albumTypeId !== undefined) update.album_type_id = body.albumTypeId || null;
  if (body.parentEditingEnabled !== undefined) update.parent_editing_enabled = !!body.parentEditingEnabled;
  if (body.questions !== undefined) {
    // Ключ питання стабільний (до нього прив'язані відповіді); нове питання отримує ключ з назви.
    const used = new Set<string>();
    const questions = parseQuestions(
      (Array.isArray(body.questions) ? body.questions : []).map((q: any) => ({ key: q?.key || "", label: q?.label ?? "" }))
    ).map((q) => {
      let key = q.key || slotKeySlug(q.label) || "q";
      while (used.has(key)) key = `${key}_2`;
      used.add(key);
      return { key, label: q.label };
    });
    update.questions = questions;
  }

  if (update.slot_start && update.slot_end && String(update.slot_start) > String(update.slot_end)) {
    return NextResponse.json({ error: "Початок має бути раніше за кінець" }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();
  const { error } = await service.from("classes").update(update as never).eq("id", params.classId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await broadcastClassChange(params.classId);
  return NextResponse.json({ ok: true });
}
