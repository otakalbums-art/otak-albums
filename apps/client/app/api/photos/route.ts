import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { compareFilenamesDesc, signPhotoUrls } from "@otak/supabase/photo-variants";
import { loadGallery } from "@/lib/gallery-data";

/**
 * GET /api/photos            — усі фото класу поточного учня + прапорець favorite + class {name, schoolName}
 * GET /api/photos?favorites=1 — лише позначені зіркою
 *
 * Відповідь велика (підписані посилання на кожне фото), тож галерея не
 * опитує її постійно — лише коли змінився відбиток з /api/photos/version
 * (див. lib/gallery-data.ts). Формування фото для альбому — окремо,
 * apps/client/app/album.
 *
 * Авторизація: otak_session cookie -> students.session_token (не Supabase Auth JWT).
 */
export async function GET(req: Request) {
  const sessionToken = cookies().get("otak_session")?.value;
  if (!sessionToken) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });

  const g = await loadGallery(sessionToken);
  if (!g) return NextResponse.json({ error: "Сесія недійсна" }, { status: 401 });
  const { supabase, classInfo, galleryEnabled, downloadEnabled, faceConsent, categories, rows, version } = g;

  if (!galleryEnabled) {
    return NextResponse.json({ photos: [], class: classInfo, galleryEnabled, downloadEnabled, faceConsent, version });
  }

  const { searchParams } = new URL(req.url);
  const favoritesOnly = searchParams.get("favorites") === "1";

  // Bucket "photos" приватний — фото віддаються лише через короткоживучі
  // signed URLs, згенеровані тут service_role клієнтом.
  const paths = rows.map((p) => p.storage_path);
  // Сітка — мініатюра (~480 px), перегляд на весь екран — preview (~1600 px).
  // Завантаження вимкнено адміном — віддаємо ЛИШЕ крихітну копію (~160 px,
  // TINY; без неї — thumb, але ніколи не оригінал), а перегляд на весь екран
  // у галереї вимкнено: якісних копій не підписуємо взагалі.
  const [thumbByPath, previewByPath] = await Promise.all([
    signPhotoUrls(supabase, paths, downloadEnabled ? "thumb" : "tiny"),
    downloadEnabled ? signPhotoUrls(supabase, paths, "preview") : Promise.resolve(null),
  ]);
  const sizeMark = (url?: string) => (url?.includes("/TINY/") ? "y" : url?.includes("/THUMB/") ? "t" : "o");

  const mapped = rows
    .map((p) => ({
      id: p.id,
      filename: p.filename,
      category: p.category,
      thumbnailUrl: thumbByPath.get(p.storage_path),
      previewUrl: previewByPath?.get(p.storage_path),
      // Змінюється, коли кадр замінено або для нього з'явилась мініатюра — галерея тоді бере новий URL.
      version: `${p.storage_path}|${sizeMark(thumbByPath.get(p.storage_path))}|${downloadEnabled ? "d" : "v"}`,
      is_favorite: p.is_favorite,
    }))
    .filter((p) => !favoritesOnly || p.is_favorite)
    // За номером кадру, від нових до старих (не за часом надходження — камера дошлює старі кадри впереміш).
    .sort((a, b) => compareFilenamesDesc(a.filename, b.filename));

  // Категорії для фільтра в галереї: лише ті, де є фото, у порядку з адмінки.
  const present = new Set(rows.map((p) => p.category));
  const galleryCategories = categories.filter((c) => present.has(c.key)).map((c) => ({ key: c.key, label: c.label }));

  return NextResponse.json({
    photos: mapped,
    categories: galleryCategories,
    class: classInfo,
    galleryEnabled,
    downloadEnabled,
    // Згода батьків на пошук дитини за обличчям (0019_faces.sql).
    faceConsent,
    version,
  });
}
