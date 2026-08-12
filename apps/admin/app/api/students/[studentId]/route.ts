import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { requireAdmin } from "@/lib/require-admin";

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
  const { error } = await service.from("students").delete().eq("id", params.studentId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
