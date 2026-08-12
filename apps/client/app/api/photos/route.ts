import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServiceRoleClient } from "@otak/supabase";

/**
 * GET /api/photos            — усі фото класу поточного учня + прапорець favorite + class {name, schoolName}
 * GET /api/photos?favorites=1 — лише позначені зіркою
 *
 * Формування фото для альбому (колишній плаский "відбір") — окремо,
 * apps/client/app/album (слоти CRM, обмежені кандидат-пулом із favorites).
 *
 * Авторизація: otak_session cookie -> students.session_token (не Supabase Auth JWT).
 */
export async function GET(req: Request) {
  const sessionToken = cookies().get("otak_session")?.value;
  if (!sessionToken) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });

  const supabase = createSupabaseServiceRoleClient();
  const { data: student } = await supabase
    .from("students")
    .select("id, class_id, classes(name, schools(name))")
    .eq("session_token", sessionToken)
    .single();

  if (!student) return NextResponse.json({ error: "Сесія недійсна" }, { status: 401 });

  const studentClass = (student as any).classes;
  const classInfo = { name: studentClass?.name ?? "", schoolName: studentClass?.schools?.name ?? "" };

  const { searchParams } = new URL(req.url);
  const favoritesOnly = searchParams.get("favorites") === "1";

  const { data: photos } = await supabase
    .from("photos")
    .select("id, filename, storage_path, favorites(student_id)")
    .eq("class_id", student.class_id)
    .eq("file_type", "jpeg")
    .order("uploaded_at", { ascending: false });

  // Bucket "photos" приватний — прев'ю/повнорозмірні фото віддаються лише
  // через короткоживучі signed URLs, згенеровані тут service_role клієнтом.
  const paths = (photos ?? []).map((p: any) => p.storage_path);
  const { data: signedUrls } = paths.length
    ? await supabase.storage.from("photos").createSignedUrls(paths, 60 * 60) // 1 год
    : { data: [] as any[] };
  const urlByPath = new Map((signedUrls ?? []).map((s: any) => [s.path, s.signedUrl]));

  const mapped = (photos ?? [])
    .map((p: any) => ({
      id: p.id,
      filename: p.filename,
      thumbnailUrl: urlByPath.get(p.storage_path),
      is_favorite: p.favorites?.some((f: any) => f.student_id === student.id),
    }))
    .filter((p: any) => !favoritesOnly || p.is_favorite);

  return NextResponse.json({ photos: mapped, class: classInfo });
}
