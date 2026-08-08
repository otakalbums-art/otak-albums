import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServiceRoleClient } from "@otak/supabase";

/**
 * POST /api/photos/[id]/favorite — тогл "обране" (крок 1 відбору).
 * Авторизація: otak_session cookie -> students.session_token (див. docs/auth-strategy.md).
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const sessionToken = cookies().get("otak_session")?.value;
  if (!sessionToken) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });

  const supabase = createSupabaseServiceRoleClient();
  const { data: student } = await supabase
    .from("students")
    .select("id, class_id")
    .eq("session_token", sessionToken)
    .single();

  if (!student) return NextResponse.json({ error: "Сесія недійсна" }, { status: 401 });

  const { data: photo } = await supabase.from("photos").select("id, class_id").eq("id", params.id).single();
  if (!photo || photo.class_id !== student.class_id) {
    return NextResponse.json({ error: "Фото не знайдено" }, { status: 404 });
  }

  const { data: existing } = await supabase
    .from("favorites")
    .select("id")
    .eq("student_id", student.id)
    .eq("photo_id", params.id)
    .maybeSingle();

  if (existing) {
    await supabase.from("favorites").delete().eq("id", existing.id);
    return NextResponse.json({ is_favorite: false });
  }

  await supabase.from("favorites").insert({ student_id: student.id, photo_id: params.id });
  return NextResponse.json({ is_favorite: true });
}
