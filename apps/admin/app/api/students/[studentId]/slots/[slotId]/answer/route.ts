import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { requireAdmin } from "@/lib/require-admin";

/**
 * PUT /api/students/[studentId]/slots/[slotId]/answer
 * Body: { answer: string } — адмінський upsert текстового слоту (працює й
 * для слотів filled_by='student' — адмін завжди може підправити вручну,
 * напр. якщо учень продиктував відповідь телефоном).
 */
export async function PUT(req: Request, { params }: { params: { studentId: string; slotId: string } }) {
  const user = await requireAdmin("crm");
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const { answer } = await req.json();
  if (typeof answer !== "string") return NextResponse.json({ error: "answer має бути текстом" }, { status: 400 });

  const service = createSupabaseServiceRoleClient();

  const { data: student } = await service
    .from("students")
    .select("id, classes(album_type_id)")
    .eq("id", params.studentId)
    .maybeSingle();
  if (!student) return NextResponse.json({ error: "Учня не знайдено" }, { status: 404 });

  const { data: slot } = await service
    .from("album_type_slots")
    .select("id, kind, album_type_id")
    .eq("id", params.slotId)
    .maybeSingle();
  if (!slot || slot.kind !== "text") return NextResponse.json({ error: "Це не текстовий слот" }, { status: 400 });
  if (slot.album_type_id !== (student as any).classes?.album_type_id) {
    return NextResponse.json({ error: "Слот не належить типу альбому цього класу" }, { status: 400 });
  }

  const { error } = await service
    .from("student_slot_answers")
    .upsert(
      { student_id: params.studentId, slot_id: params.slotId, answer, updated_at: new Date().toISOString() },
      { onConflict: "student_id,slot_id" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
