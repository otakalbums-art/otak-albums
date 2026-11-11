import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { requireAdmin } from "@/lib/require-admin";
import { broadcastStudentChange } from "@/lib/class-realtime";

/** PUT /api/students/[studentId]/answers — відповідь анкети від імені адміна. Body: { key, answer } */
export async function PUT(req: Request, { params }: { params: { studentId: string } }) {
  const user = await requireAdmin("crm");
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const { key, answer } = await req.json();
  if (typeof key !== "string" || !key) return NextResponse.json({ error: "Невірне питання" }, { status: 400 });

  const service = createSupabaseServiceRoleClient();
  const { error } = await service.from("student_answers").upsert({
    student_id: params.studentId,
    question_key: key,
    answer: String(answer ?? "").slice(0, 2000),
    updated_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await broadcastStudentChange(params.studentId);
  return NextResponse.json({ ok: true });
}
