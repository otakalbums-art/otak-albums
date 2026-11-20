import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { requireAdmin } from "@/lib/require-admin";

/**
 * GET /api/photos/[id]/download — оригінал одного файлу (JPEG чи RAW).
 * Перенаправляє на короткоживуче підписане посилання Storage з
 * Content-Disposition: attachment під справжньою назвою файлу.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireAdmin(["crm", "classes"]);
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const service = createSupabaseServiceRoleClient();
  const { data: photo } = await service
    .from("photos")
    .select("filename, storage_path")
    .eq("id", params.id)
    .maybeSingle();
  if (!photo) return NextResponse.json({ error: "Фото не знайдено" }, { status: 404 });

  const { data, error } = await service.storage
    .from("photos")
    .createSignedUrl(photo.storage_path, 300, { download: photo.filename });
  if (error || !data) return NextResponse.json({ error: "Не вдалося підготувати файл" }, { status: 500 });
  return NextResponse.redirect(data.signedUrl, 302);
}
