import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServiceRoleClient } from "@otak/supabase";

/**
 * GET /api/photos            — усі фото класу поточного учня + прапорці favorite/selected
 * GET /api/photos?favorites=1 — лише позначені зіркою
 *
 * Авторизація: otak_session cookie -> students.session_token (не Supabase Auth JWT).
 */
export async function GET(req: Request) {
  const sessionToken = cookies().get("otak_session")?.value;
  if (!sessionToken) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });

  const supabase = createSupabaseServiceRoleClient();
  const { data: student } = await supabase
    .from("students")
    .select("id, class_id")
    .eq("session_token", sessionToken)
    .single();

  if (!student) return NextResponse.json({ error: "Сесія недійсна" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const favoritesOnly = searchParams.get("favorites") === "1";

  const { data: photos } = await supabase
    .from("photos")
    .select("id, filename, storage_path, favorites(student_id), album_selections(student_id)")
    .eq("class_id", student.class_id)
    .eq("file_type", "jpeg")
    .order("uploaded_at", { ascending: false });

  const mapped = (photos ?? [])
    .map((p: any) => ({
      id: p.id,
      filename: p.filename,
      storage_path: p.storage_path,
      is_favorite: p.favorites?.some((f: any) => f.student_id === student.id),
      is_selected: p.album_selections?.some((s: any) => s.student_id === student.id),
    }))
    .filter((p: any) => !favoritesOnly || p.is_favorite);

  return NextResponse.json({ photos: mapped });
}
