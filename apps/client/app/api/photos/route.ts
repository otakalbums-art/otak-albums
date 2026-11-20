import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServiceRoleClient } from "@otak/supabase";
import { compareFilenames, signPhotoUrls } from "@otak/supabase/photo-variants";

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
  // Сітка — мініатюра (~480 px, десятки КБ), перегляд на весь екран — preview
  // (~1600 px); оригінали по 3–4 МБ галерея більше не тягне (photo-variants.ts).
  const [thumbByPath, previewByPath] = await Promise.all([
    signPhotoUrls(supabase, paths, "thumb"),
    signPhotoUrls(supabase, paths, "preview"),
  ]);

  const mapped = (photos ?? [])
    .map((p: any) => ({
      id: p.id,
      filename: p.filename,
      thumbnailUrl: thumbByPath.get(p.storage_path),
      previewUrl: previewByPath.get(p.storage_path),
      // Змінюється, коли кадр замінено або для нього з'явилась мініатюра — галерея тоді бере новий URL.
      version: `${p.storage_path}|${thumbByPath.get(p.storage_path)?.includes("/THUMB/") ? "t" : "o"}`,
      is_favorite: p.favorites?.some((f: any) => f.student_id === student.id),
    }))
    .filter((p: any) => !favoritesOnly || p.is_favorite)
    // Чітко за номером кадру, а не за часом надходження (дві камери шлють упереміш).
    .sort((a: any, b: any) => compareFilenames(a.filename, b.filename));

  return NextResponse.json({ photos: mapped, class: classInfo });
}
