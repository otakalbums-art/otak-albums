import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { requireAdmin } from "@/lib/require-admin";
import { compareFilenamesDesc, signPhotoUrls, variantPath } from "@otak/supabase/photo-variants";

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
    // За номером кадру, від нових до старих — так само, як у галереї батьків.
    .sort((a: any, b: any) => compareFilenamesDesc(a.filename, b.filename));

  return NextResponse.json({ photos: mapped });
}

/**
 * DELETE /api/classes/[classId]/photos { ids: string[] } — видалити фото
 * назавжди: файли зі Storage (оригінал + мініатюра + preview) і рядки photos.
 * Обране, вибір у місця альбому тощо зникають каскадом (FK on delete cascade);
 * у кого із зачеплених дітей відбір був підтверджений — підтвердження знімається.
 */
export async function DELETE(req: Request, { params }: { params: { classId: string } }) {
  const user = await requireAdmin("classes");
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const { ids } = await req.json().catch(() => ({ ids: null }));
  if (!Array.isArray(ids) || !ids.length) return NextResponse.json({ error: "Не вибрано фото" }, { status: 400 });

  const service = createSupabaseServiceRoleClient();
  const photos: { id: string; storage_path: string }[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await service
      .from("photos")
      .select("id, storage_path")
      .eq("class_id", params.classId)
      .in("id", ids.slice(i, i + 200).map(String));
    photos.push(...(data ?? []));
  }
  if (!photos.length) return NextResponse.json({ deleted: 0 });
  const photoIds = photos.map((p) => p.id);

  // Чий підтверджений відбір зачепить видалення — до каскаду, поки зв'язки ще є.
  const affected = new Set<string>();
  for (let i = 0; i < photoIds.length; i += 200) {
    const { data } = await service.from("student_slot_photos").select("student_id").in("photo_id", photoIds.slice(i, i + 200));
    for (const r of data ?? []) affected.add(r.student_id);
  }

  for (let i = 0; i < photoIds.length; i += 200) {
    const { error } = await service.from("photos").delete().in("id", photoIds.slice(i, i + 200));
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (affected.size) {
    await service.from("students").update({ selection_confirmed_at: null }).in("id", [...affected]);
  }

  // Файли — після рядків: навіть якщо Storage десь не відповість, на платформі фото вже немає.
  const files = photos.flatMap((p) =>
    [p.storage_path, variantPath(p.storage_path, "thumb"), variantPath(p.storage_path, "preview")].filter(
      (x): x is string => !!x
    )
  );
  for (let i = 0; i < files.length; i += 500) {
    const { error } = await service.storage.from("photos").remove(files.slice(i, i + 500));
    if (error) console.error("[photos/delete] storage:", error.message);
  }

  return NextResponse.json({ deleted: photoIds.length, unconfirmed: affected.size });
}
