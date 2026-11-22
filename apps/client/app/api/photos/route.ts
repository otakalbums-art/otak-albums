import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServiceRoleClient } from "@otak/supabase";
import { compareFilenamesDesc, signPhotoUrls } from "@otak/supabase/photo-variants";
import { inList, loadPhotoCategories } from "@otak/supabase/photo-categories";
import { fetchAllRows } from "@otak/supabase/paginate";

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
    .select("id, class_id, face_search_consent_at, classes(name, parent_gallery_enabled, parent_download_enabled, schools(name))")
    .eq("session_token", sessionToken)
    .single();

  if (!student) return NextResponse.json({ error: "Сесія недійсна" }, { status: 401 });

  const studentClass = (student as any).classes;
  const classInfo = { name: studentClass?.name ?? "", schoolName: studentClass?.schools?.name ?? "" };
  // Перемикачі адміна для класу (supabase/migrations/0017_parent_access_flags.sql).
  const galleryEnabled = studentClass?.parent_gallery_enabled !== false;
  const downloadEnabled = galleryEnabled && studentClass?.parent_download_enabled !== false;
  // Перегляд закрито — фото й «Обране» лише приховуємо, у базі все лишається.
  if (!galleryEnabled) {
    return NextResponse.json({ photos: [], class: classInfo, galleryEnabled, downloadEnabled });
  }

  const { searchParams } = new URL(req.url);
  const favoritesOnly = searchParams.get("favorites") === "1";

  // Категорії, приховані від батьків в адмінці («Категорії фото»).
  const categories = await loadPhotoCategories(supabase);
  const hidden = categories.filter((c) => c.hidden_from_parents).map((c) => c.key);
  // Сторінками: Supabase віддає максимум 1000 рядків за запит.
  const photos = await fetchAllRows((from, to) => {
    let q = supabase
      .from("photos")
      .select("id, filename, storage_path, category, favorites(student_id)")
      .eq("class_id", student.class_id)
      .eq("file_type", "jpeg");
    if (hidden.length) q = q.not("category", "in", inList(hidden));
    return q.order("uploaded_at", { ascending: false }).order("id").range(from, to);
  });

  // Bucket "photos" приватний — прев'ю/повнорозмірні фото віддаються лише
  // через короткоживучі signed URLs, згенеровані тут service_role клієнтом.
  const paths = (photos ?? []).map((p: any) => p.storage_path);
  // Сітка — мініатюра (~480 px, десятки КБ), перегляд на весь екран — preview
  // (~1600 px); оригінали по 3–4 МБ галерея більше не тягне (photo-variants.ts).
  // Завантаження вимкнено адміном — віддаємо ЛИШЕ крихітну копію (~160 px,
  // TINY; без неї — thumb, але ніколи не оригінал), а перегляд на весь екран
  // у галереї вимкнено: якісних копій не підписуємо взагалі, тож і скриншот,
  // і «витягнути» файл дадуть тільки маленьке розмите фото.
  const [thumbByPath, previewByPath] = await Promise.all([
    signPhotoUrls(supabase, paths, downloadEnabled ? "thumb" : "tiny"),
    downloadEnabled ? signPhotoUrls(supabase, paths, "preview") : Promise.resolve(null),
  ]);
  const sizeMark = (url?: string) => (url?.includes("/TINY/") ? "y" : url?.includes("/THUMB/") ? "t" : "o");

  const mapped = (photos ?? [])
    .map((p: any) => ({
      id: p.id,
      filename: p.filename,
      category: p.category,
      thumbnailUrl: thumbByPath.get(p.storage_path),
      previewUrl: previewByPath?.get(p.storage_path),
      // Змінюється, коли кадр замінено або для нього з'явилась мініатюра — галерея тоді бере новий URL.
      version: `${p.storage_path}|${sizeMark(thumbByPath.get(p.storage_path))}|${downloadEnabled ? "d" : "v"}`,
      is_favorite: p.favorites?.some((f: any) => f.student_id === student.id),
    }))
    .filter((p: any) => !favoritesOnly || p.is_favorite)
    // За номером кадру, від нових до старих (не за часом надходження — камера дошлює старі кадри впереміш).
    .sort((a: any, b: any) => compareFilenamesDesc(a.filename, b.filename));

  // Категорії для фільтра в галереї: лише ті, де є фото, у порядку з адмінки.
  const present = new Set((photos ?? []).map((p: any) => p.category));
  const galleryCategories = categories
    .filter((c) => present.has(c.key))
    .map((c) => ({ key: c.key, label: c.label }));

  return NextResponse.json({
    photos: mapped,
    categories: galleryCategories,
    class: classInfo,
    galleryEnabled,
    downloadEnabled,
    // Згода батьків на пошук дитини за обличчям (0019_faces.sql).
    faceConsent: !!(student as any).face_search_consent_at,
  });
}
