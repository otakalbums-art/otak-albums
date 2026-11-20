import type { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { frameKey } from "@/lib/file-type";

export type RawTwin = { id: string; filename: string; storage_path: string };

/**
 * Усі RAW класу за ключем кадру ("R6__0740.CR3" -> "r6__0740"): до JPEG,
 * обраного в альбом, так знаходиться його RAW — незалежно від категорії й
 * часу, коли фотограф його довантажив.
 */
export async function rawTwinsForClass(
  service: ReturnType<typeof createSupabaseServiceRoleClient>,
  classId: string
) {
  const byKey = new Map<string, RawTwin>();
  for (let from = 0; ; from += 1000) {
    const { data } = await service
      .from("photos")
      .select("id, filename, storage_path, uploaded_at")
      .eq("class_id", classId)
      .eq("file_kind", "raw")
      .order("uploaded_at")
      .range(from, from + 999);
    // Новіша версія того самого кадру перекриває старішу.
    for (const p of data ?? []) byKey.set(frameKey(p.filename), p);
    if (!data || data.length < 1000) break;
  }
  return byKey;
}
