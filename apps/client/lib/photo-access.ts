import { cookies } from "next/headers";
import { createSupabaseServiceRoleClient } from "@otak/supabase";

/**
 * Оригінали JPEG класу поточного учня (otak_session -> students.session_token).
 * Для завантаження фото батьками: лише JPEG і лише свого класу — RAW і чужі
 * класи сюди не потрапляють, хоч би які id надіслав браузер.
 * "blocked" — адмін закрив батькам перегляд або завантаження фото для класу.
 */
export async function classJpegsForSession(ids: string[]) {
  const sessionToken = cookies().get("otak_session")?.value;
  if (!sessionToken) return null;
  const supabase = createSupabaseServiceRoleClient();
  const { data: student } = await supabase
    .from("students")
    .select("id, class_id, classes(status, parent_gallery_enabled, parent_download_enabled)")
    .eq("session_token", sessionToken)
    .maybeSingle();
  const klass = (student as any)?.classes;
  if (!student || !klass || klass.status === "archived") return null;
  if (!klass.parent_gallery_enabled || !klass.parent_download_enabled) return "blocked" as const;

  const photos: { id: string; filename: string; storage_path: string }[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase
      .from("photos")
      .select("id, filename, storage_path")
      .eq("class_id", student.class_id)
      .eq("file_type", "jpeg")
      .in("id", ids.slice(i, i + 200));
    photos.push(...(data ?? []));
  }
  return { supabase, photos };
}
