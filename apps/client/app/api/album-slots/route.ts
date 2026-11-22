import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServiceRoleClient } from "@otak/supabase";
import { signPhotoUrls } from "@otak/supabase/photo-variants";
import { hiddenCategoryKeys, inList } from "@otak/supabase/photo-categories";

/**
 * GET /api/album-slots — фото-слоти (kind='photo') типу альбому класу
 * учня + поточні призначення учня в student_slot_photos + його favorites
 * (кандидат-пул для вибору) + чи підтвердив відбір.
 *
 * Авторизація: otak_session cookie -> students.session_token, той самий
 * підхід, що й apps/client/app/api/photos/route.ts.
 */
export async function GET() {
  const sessionToken = cookies().get("otak_session")?.value;
  if (!sessionToken) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });

  const supabase = createSupabaseServiceRoleClient();
  const { data: student } = await supabase
    .from("students")
    .select("id, class_id, selection_confirmed_at, classes(album_type_id, parent_editing_enabled, parent_gallery_enabled, parent_download_enabled)")
    .eq("session_token", sessionToken)
    .single();

  if (!student) return NextResponse.json({ error: "Сесія недійсна" }, { status: 401 });

  const klass = (student as any).classes;
  const albumTypeId = klass?.album_type_id;
  // Перемикачі адміна: перегляд фото (приховує і вибрані фото) і редагування (замикає вибір).
  const galleryEnabled = klass?.parent_gallery_enabled !== false;
  const editingEnabled = klass?.parent_editing_enabled !== false;
  if (!albumTypeId) {
    return NextResponse.json({ slots: [], assignments: {}, favorites: [], confirmedAt: null, galleryEnabled, editingEnabled });
  }

  const { data: slots } = await supabase
    .from("album_type_slots")
    .select("id, label, max_photos, sort_order")
    .eq("album_type_id", albumTypeId)
    .eq("kind", "photo")
    .order("sort_order");

  const slotIds = (slots ?? []).map((s: any) => s.id);

  if (!galleryEnabled) {
    return NextResponse.json({
      slots: slots ?? [],
      assignments: {},
      favorites: [],
      confirmedAt: student.selection_confirmed_at,
      galleryEnabled,
      editingEnabled,
    });
  }

  const [{ data: assignedRows }, { data: favoriteRows }] = await Promise.all([
    slotIds.length
      ? supabase
          .from("student_slot_photos")
          .select("slot_id, photos(id, filename, storage_path, category)")
          .eq("student_id", student.id)
          .in("slot_id", slotIds)
      : Promise.resolve({ data: [] as any[] }),
    supabase
      .from("favorites")
      .select("photos(id, filename, storage_path, category)")
      .eq("student_id", student.id),
  ]);

  // Фото з прихованих від батьків категорій не показуємо (у базі вибір лишається).
  const hidden = new Set(await hiddenCategoryKeys(supabase));
  for (const rows of [assignedRows, favoriteRows]) {
    for (const r of (rows ?? []) as any[]) if (r.photos && hidden.has(r.photos.category)) r.photos = null;
  }

  // Signed URLs одним батчем для всіх задіяних фото (призначені + обрані).
  const paths = new Set<string>();
  for (const r of assignedRows ?? []) if ((r as any).photos?.storage_path) paths.add((r as any).photos.storage_path);
  for (const r of favoriteRows ?? []) if ((r as any).photos?.storage_path) paths.add((r as any).photos.storage_path);
  // Мініатюри (~480 px) замість оригіналів — packages/supabase/src/photo-variants.ts.
  // Завантаження вимкнено — і тут лише крихітні копії (~160 px), як у галереї.
  const urlByPath = await signPhotoUrls(
    supabase,
    [...paths],
    (student as any).classes?.parent_download_enabled === false ? "tiny" : "thumb"
  );

  const assignments: Record<string, { id: string; filename: string; url: string | null }[]> = {};
  (assignedRows ?? []).forEach((r: any) => {
    if (!r.photos) return;
    const list = assignments[r.slot_id] ?? [];
    const url: string | null = urlByPath.get(r.photos.storage_path) ?? null;
    list.push({ id: r.photos.id, filename: r.photos.filename, url });
    assignments[r.slot_id] = list;
  });

  const favorites = (favoriteRows ?? [])
    .filter((r: any) => r.photos)
    .map((r: any) => ({ id: r.photos.id, filename: r.photos.filename, url: urlByPath.get(r.photos.storage_path) ?? null }));

  return NextResponse.json({
    slots: slots ?? [],
    assignments,
    favorites,
    confirmedAt: student.selection_confirmed_at,
    galleryEnabled,
    editingEnabled,
  });
}
