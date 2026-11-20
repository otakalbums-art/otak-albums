import { cookies } from "next/headers";
import { createSupabaseServiceRoleClient } from "@otak/supabase";
import { fetchAllRows } from "@otak/supabase/paginate";
import { hiddenCategoryKeys, inList } from "@otak/supabase/photo-categories";

/**
 * Поточний учень (otak_session) для API облич + фото його класу, які батькам
 * можна бачити (JPEG, не з прихованих категорій). null — не авторизовано,
 * "closed" — адмін закрив перегляд фото для класу.
 */
export async function faceContext() {
  const token = cookies().get("otak_session")?.value;
  if (!token) return null;
  const supabase = createSupabaseServiceRoleClient();
  const { data: student } = await supabase
    .from("students")
    .select("id, class_id, face_search_consent_at, classes(status, parent_gallery_enabled)")
    .eq("session_token", token)
    .maybeSingle();
  const klass = (student as any)?.classes;
  if (!student || !klass || klass.status === "archived") return null;
  if (klass.parent_gallery_enabled === false) return "closed" as const;

  async function visiblePhotos() {
    const hidden = await hiddenCategoryKeys(supabase);
    return fetchAllRows<{ id: string; filename: string }>((from, to) => {
      let q = supabase.from("photos").select("id, filename").eq("class_id", student!.class_id).eq("file_type", "jpeg");
      if (hidden.length) q = q.not("category", "in", inList(hidden));
      return q.order("id").range(from, to);
    });
  }

  return {
    supabase,
    studentId: student.id as string,
    classId: student.class_id as string,
    consent: !!student.face_search_consent_at,
    visiblePhotos,
  };
}
