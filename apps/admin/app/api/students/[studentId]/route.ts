import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { requireAdmin } from "@/lib/require-admin";
import { broadcastClassChange } from "@/lib/class-realtime";

const TIME_RE = /^\d{2}:\d{2}$/;

function money(v: unknown): number | null | "invalid" {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : "invalid";
}

/**
 * PATCH /api/students/[studentId] — час зйомки, завдаток, доплата.
 * Body (усі необов'язкові): { shootTime: "HH:MM" | null, depositAmount, extraPaymentAmount }
 * Адмін може поставити будь-який час (не лише зі слотів), але не той, що вже
 * зайнятий іншою дитиною цього класу. "Внесено" = завдаток + доплата
 * рахує тригер у БД (supabase/migrations/0013_parent_cabinet.sql).
 */
export async function PATCH(req: Request, { params }: { params: { studentId: string } }) {
  const user = await requireAdmin("crm");
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const body = await req.json();
  const update: Record<string, unknown> = {};

  if (body.shootTime !== undefined) {
    if (body.shootTime && !TIME_RE.test(body.shootTime)) return NextResponse.json({ error: "Невірний час" }, { status: 400 });
    update.shoot_time = body.shootTime || null;
  }
  for (const [field, column] of [
    ["depositAmount", "deposit_amount"],
    ["extraPaymentAmount", "extra_payment_amount"],
  ] as const) {
    if (body[field] === undefined) continue;
    const v = money(body[field]);
    if (v === "invalid") return NextResponse.json({ error: "Невірна сума" }, { status: 400 });
    update[column] = v;
  }

  const service = createSupabaseServiceRoleClient();
  const { data: student, error } = await service
    .from("students")
    .update(update as never)
    .eq("id", params.studentId)
    .select("class_id")
    .single();

  if (error) {
    if (error.code === "23505") {
      const { data: me } = await service.from("students").select("class_id").eq("id", params.studentId).single();
      const { data: other } = me
        ? await service
            .from("students")
            .select("first_name, last_name")
            .eq("class_id", me.class_id)
            .eq("shoot_time", update.shoot_time as string)
            .maybeSingle()
        : { data: null };
      const who = other ? `${other.last_name} ${other.first_name}` : "іншою дитиною";
      return NextResponse.json({ error: `Цей час уже зайнятий: ${who}` }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await broadcastClassChange(student.class_id);
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/students/[studentId] — видалити учня (або персонал) із класу.
 * Каскадно видаляє його favorites/album_selections/student_slot_photos/
 * student_slot_answers (усі FK -> students(id) on delete cascade,
 * supabase/migrations/0001_init.sql, 0004_student_crm.sql) — фото самого
 * класу не чіпаються, лише прив'язка "хто обрав/чиї відповіді".
 */
export async function DELETE(_req: Request, { params }: { params: { studentId: string } }) {
  const user = await requireAdmin("crm");
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const service = createSupabaseServiceRoleClient();
  const { data: deleted, error } = await service
    .from("students")
    .delete()
    .eq("id", params.studentId)
    .select("class_id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (deleted?.class_id) await broadcastClassChange(deleted.class_id);
  return NextResponse.json({ ok: true });
}
