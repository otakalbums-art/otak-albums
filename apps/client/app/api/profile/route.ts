import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServiceRoleClient } from "@otak/supabase";

/**
 * GET  /api/profile — текстові CRM-слоти, які учень заповнює сам (Цитата,
 *      Моя мрія...), + вже збережені відповіді.
 * POST /api/profile — зберегти відповіді. Body: { answers: {[slotId]: string} }
 *
 * Авторизація: otak_session cookie -> students.session_token, той самий
 * підхід, що й apps/client/app/api/photos/route.ts. Приймаються лише
 * slotId зі списку "дозволених" (kind='text' AND filled_by='student' типу
 * альбому класу учня) — решта тихо ігнорується.
 */
async function getStudentAndAllowedSlots() {
  const sessionToken = cookies().get("otak_session")?.value;
  if (!sessionToken) return null;

  const supabase = createSupabaseServiceRoleClient();
  const { data: student } = await supabase
    .from("students")
    .select("id, class_id, classes(album_type_id)")
    .eq("session_token", sessionToken)
    .single();

  if (!student) return null;

  const albumTypeId = (student as any).classes?.album_type_id;
  if (!albumTypeId) return { supabase, student, slots: [] as any[] };

  const { data: slots } = await supabase
    .from("album_type_slots")
    .select("id, key, label, sort_order")
    .eq("album_type_id", albumTypeId)
    .eq("kind", "text")
    .eq("filled_by", "student")
    .order("sort_order");

  return { supabase, student, slots: slots ?? [] };
}

export async function GET() {
  const ctx = await getStudentAndAllowedSlots();
  if (!ctx) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  const { supabase, student, slots } = ctx;

  const slotIds = slots.map((s: any) => s.id);
  const { data: existing } = slotIds.length
    ? await supabase.from("student_slot_answers").select("slot_id, answer").eq("student_id", student.id).in("slot_id", slotIds)
    : { data: [] as any[] };

  const answers = Object.fromEntries((existing ?? []).map((a: any) => [a.slot_id, a.answer]));
  return NextResponse.json({ slots: slots.map((s: any) => ({ id: s.id, key: s.key, label: s.label })), answers });
}

export async function POST(req: Request) {
  const ctx = await getStudentAndAllowedSlots();
  if (!ctx) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  const { supabase, student, slots } = ctx;

  const { answers } = await req.json();
  if (!answers || typeof answers !== "object") {
    return NextResponse.json({ error: "Невірний формат" }, { status: 400 });
  }

  const allowedSlotIds = new Set(slots.map((s: any) => s.id));
  const rows = Object.entries(answers as Record<string, string>)
    .filter(([slotId]) => allowedSlotIds.has(slotId))
    .map(([slotId, answer]) => ({
      student_id: student.id,
      slot_id: slotId,
      answer: String(answer),
      updated_at: new Date().toISOString(),
    }));

  if (rows.length > 0) {
    const { error } = await supabase.from("student_slot_answers").upsert(rows, { onConflict: "student_id,slot_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
