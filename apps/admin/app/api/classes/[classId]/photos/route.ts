import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { requireAdmin } from "@/lib/require-admin";
import { compareFilenamesDesc, signPhotoUrls, variantPath } from "@otak/supabase/photo-variants";
import { fetchAllRows } from "@otak/supabase/paginate";

/**
 * GET /api/classes/[classId]/photos — усі фото класу для адмінки, і JPEG,
 * і RAW (на відміну від apps/client/app/api/photos/route.ts, який
 * навмисно віддає учням лише file_type = 'jpeg').
 *
 * Bucket "photos" приватний -> signed URLs через service_role client, так
 * само, як student-facing /api/photos. Для RAW-файлів signed URL веде на
 * завантаження оригіналу (браузер їх не рендерить), для JPEG — на прев'ю.
 */
export async function GET(req: Request, { params }: { params: { classId: string } }) {
  const user = await requireAdmin(["classes", "crm"]);
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const service = createSupabaseServiceRoleClient();
  // Сторінками: Supabase віддає максимум 1000 рядків за запит, а за зйомку файлів більше.
  let photos: any[];
  try {
    photos = await fetchAllRows((from, to) =>
      service
        .from("photos")
        .select("id, filename, storage_path, file_type, file_kind, category, student_id, uploaded_at")
        .eq("class_id", params.classId)
        .order("uploaded_at", { ascending: false })
        .order("id")
        .range(from, to)
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  // Відбиток списку: галерея опитує лише його (?versionOnly=1, кілька байтів)
  // і тягне повний список з посиланнями тільки коли він змінився — щоб не
  // витрачати трафік Vercel (Fast Origin Transfer) на однакові відповіді.
  const hash = createHash("sha1");
  for (const p of [...photos].sort((a, b) => (a.id < b.id ? -1 : 1))) hash.update(`${p.id}|${p.storage_path}|${p.category}\n`);
  const version = hash.digest("hex").slice(0, 16);
  if (new URL(req.url).searchParams.get("versionOnly") === "1") {
    return NextResponse.json({ version }, { headers: { "Cache-Control": "no-store" } });
  }

  // Підписуємо лише мініатюри JPEG. Оригінал («Відкрити JPEG», RAW) береться
  // на вимогу через /api/photos/[id]/download — не тягнемо тисячі зайвих посилань.
  const jpegPaths = photos.filter((p) => p.file_kind === "jpeg").map((p) => p.storage_path);
  const thumbByPath = await signPhotoUrls(service, jpegPaths, "thumb");

  const mapped = photos
    .map((p: any) => ({ ...p, url: p.file_kind === "jpeg" ? thumbByPath.get(p.storage_path) ?? null : null }))
    // За номером кадру, від нових до старих — так само, як у галереї батьків.
    .sort((a: any, b: any) => compareFilenamesDesc(a.filename, b.filename));

  return NextResponse.json({ photos: mapped, version });
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
    [p.storage_path, variantPath(p.storage_path, "thumb"), variantPath(p.storage_path, "preview"), variantPath(p.storage_path, "tiny")].filter(
      (x): x is string => !!x
    )
  );
  for (let i = 0; i < files.length; i += 500) {
    const { error } = await service.storage.from("photos").remove(files.slice(i, i + 500));
    if (error) console.error("[photos/delete] storage:", error.message);
  }

  return NextResponse.json({ deleted: photoIds.length, unconfirmed: affected.size });
}
