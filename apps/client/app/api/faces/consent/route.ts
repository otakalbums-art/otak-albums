import { NextResponse } from "next/server";
import { faceContext } from "@/lib/face-access";

/**
 * POST   /api/faces/consent — батьки погоджуються на пошук дитини за обличчям.
 * DELETE /api/faces/consent — відкликати згоду.
 * Дата згоди видна адміну в CRM (supabase/migrations/0019_faces.sql).
 */
export async function POST() {
  const ctx = await faceContext();
  if (!ctx) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  if (ctx === "closed") return NextResponse.json({ error: "Перегляд фото закритий" }, { status: 403 });
  const { error } = await ctx.supabase
    .from("students")
    .update({ face_search_consent_at: new Date().toISOString() } as never)
    .eq("id", ctx.studentId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const ctx = await faceContext();
  if (!ctx || ctx === "closed") return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  await ctx.supabase.from("students").update({ face_search_consent_at: null } as never).eq("id", ctx.studentId);
  return NextResponse.json({ ok: true });
}
