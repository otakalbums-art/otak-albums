import { createHash } from "crypto";
import { createSupabaseServiceRoleClient } from "@otak/supabase";
import { inList, loadPhotoCategories } from "@otak/supabase/photo-categories";
import { fetchAllRows } from "@otak/supabase/paginate";

export type GalleryRow = { id: string; filename: string; storage_path: string; category: string; is_favorite: boolean };

/**
 * Дані галереї батьків для /api/photos і /api/photos/version.
 * version — «відбиток» усього, що видно в галереї (фото, їх файли й
 * категорії, обране учня, перемикачі адміна, згода): галерея раз на кілька
 * секунд питає лише його (кілька байтів), а повний список зі ~сотнями
 * підписаних посилань тягне тільки коли відбиток змінився. Так трафік через
 * Vercel (ліміт Fast Origin Transfer) не росте від відкритих галерей.
 */
export async function loadGallery(sessionToken: string) {
  const supabase = createSupabaseServiceRoleClient();
  const { data: student } = await supabase
    .from("students")
    .select("id, class_id, face_search_consent_at, classes(name, parent_gallery_enabled, parent_download_enabled, schools(name))")
    .eq("session_token", sessionToken)
    .single();
  if (!student) return null;

  const studentClass = (student as any).classes;
  const classInfo = { name: studentClass?.name ?? "", schoolName: studentClass?.schools?.name ?? "" };
  // Перемикачі адміна для класу (supabase/migrations/0017_parent_access_flags.sql).
  const galleryEnabled = studentClass?.parent_gallery_enabled !== false;
  const downloadEnabled = galleryEnabled && studentClass?.parent_download_enabled !== false;
  const faceConsent = !!(student as any).face_search_consent_at;

  let rows: GalleryRow[] = [];
  let categories: Awaited<ReturnType<typeof loadPhotoCategories>> = [];
  // Перегляд закрито — фото й «Обране» лише приховуємо, у базі все лишається.
  if (galleryEnabled) {
    categories = await loadPhotoCategories(supabase);
    const hidden = categories.filter((c) => c.hidden_from_parents).map((c) => c.key);
    // Сторінками: Supabase віддає максимум 1000 рядків за запит.
    const photos = await fetchAllRows<any>((from, to) => {
      let q = supabase
        .from("photos")
        .select("id, filename, storage_path, category, favorites(student_id)")
        .eq("class_id", student.class_id)
        .eq("file_type", "jpeg");
      if (hidden.length) q = q.not("category", "in", inList(hidden));
      return q.order("uploaded_at", { ascending: false }).order("id").range(from, to);
    });
    rows = photos.map((p) => ({
      id: p.id,
      filename: p.filename,
      storage_path: p.storage_path,
      category: p.category,
      is_favorite: !!p.favorites?.some((f: any) => f.student_id === student.id),
    }));
  }

  const hash = createHash("sha1");
  hash.update(`${galleryEnabled}|${downloadEnabled}|${faceConsent}|${classInfo.name}|${classInfo.schoolName}\n`);
  for (const c of categories) hash.update(`c|${c.key}|${c.label}|${c.hidden_from_parents}\n`);
  for (const r of [...rows].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    hash.update(`${r.id}|${r.storage_path}|${r.category}|${r.is_favorite ? 1 : 0}\n`);
  }

  return {
    supabase,
    studentId: student.id as string,
    classInfo,
    galleryEnabled,
    downloadEnabled,
    faceConsent,
    categories,
    rows,
    version: hash.digest("hex").slice(0, 16),
  };
}
