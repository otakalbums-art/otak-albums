import { cookies } from "next/headers";
import { createSupabaseServiceRoleClient } from "@otak/supabase";

/**
 * Оригінали JPEG класу поточного учня (otak_session -> students.session_token).
 * Для завантаження фото батьками: лише JPEG і лише свого класу — RAW і чужі
 * класи сюди не потрапляють, хоч би які id надіслав браузер.
 */
export async function classJpegsForSession(ids: string[]) {
  const sessionToken = cookies().get("otak_session")?.value;
  if (!sessionToken) return null;
  const supabase = createSupabaseServiceRoleClient();
  const { data: student } = await supabase
    .from("students")
    .select("id, class_id, classes(status)")
    .eq("session_token", sessionToken)
    .maybeSingle();
  if (!student || (student as any).classes?.status === "archived") return null;

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
