import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { requireAdmin } from "@/lib/require-admin";
import { compareFilenames, signPhotoUrls } from "@otak/supabase/photo-variants";

/**
 * GET /api/classes/[classId]/photos — усі фото класу для адмінки, і JPEG,
 * і RAW (на відміну від apps/client/app/api/photos/route.ts, який
 * навмисно віддає учням лише file_type = 'jpeg').
 *
 * Bucket "photos" приватний -> signed URLs через service_role client, так
 * само, як student-facing /api/photos. Для RAW-файлів signed URL веде на
 * завантаження оригіналу (браузер їх не рендерить), для JPEG — на прев'ю.
 */
export async function GET(_req: Request, { params }: { params: { classId: string } }) {
  const user = await requireAdmin(["classes", "crm"]);
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const service = createSupabaseServiceRoleClient();
  const { data: photos, error } = await service
    .from("photos")
    .select("id, filename, storage_path, file_type, file_kind, category, student_id, uploaded_at")
    .eq("class_id", params.classId)
    .order("uploaded_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const paths = (photos ?? []).map((p: any) => p.storage_path);
  // Сітка — мініатюри, посилання "відкрити" — оригінал (packages/supabase/src/photo-variants.ts).
  const [thumbByPath, fullByPath] = await Promise.all([
    signPhotoUrls(service, paths, "thumb"),
    signPhotoUrls(service, paths, "original"),
  ]);

  const mapped = (photos ?? [])
    .map((p: any) => ({
      ...p,
      url: thumbByPath.get(p.storage_path) ?? null,
      fullUrl: fullByPath.get(p.storage_path) ?? null,
    }))
    // За номером кадру — так само, як у галереї батьків.
    .sort((a: any, b: any) => compareFilenames(a.filename, b.filename));

  return NextResponse.json({ photos: mapped });
}
