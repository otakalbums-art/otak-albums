import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { variantPath } from "@otak/supabase/photo-variants";
import { requireAdmin } from "@/lib/require-admin";
import { detectFileType } from "@/lib/file-type";
import { uploadVariants } from "@/lib/photo-variants-gen";

const CATEGORIES = ["portrait", "group", "ceremony", "personal", "uncategorized"];

/**
 * POST /api/photos/register — файл уже лежить у Storage (браузер завантажив
 * його напряму за посиланням з /api/photos/upload-urls); тут — запис у
 * таблицю photos, а для JPEG ще мініатюра й preview.
 *
 * Body: { classId, path, filename, category, studentId? }
 * Той самий кадр (назва + клас + категорія) уже є — замінюємо файл у записі
 * (обране й CRM-вибір зберігаються), як і FTP-приймач.
 */
export async function POST(req: Request) {
  const user = await requireAdmin("classes");
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const { classId, path, filename, category, studentId } = await req.json();
  const fileType = detectFileType(filename ?? "");
  if (!classId || !path || !fileType || !CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "Невірний запит" }, { status: 400 });
  }
  // Шлях має належати саме цьому класу й категорії (його видав upload-urls).
  if (!path.startsWith(`${classId}/${category}/`)) {
    return NextResponse.json({ error: "Невірний шлях файлу" }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();

  if (fileType === "jpeg") {
    const { data: blob, error } = await service.storage.from("photos").download(path);
    if (error || !blob) return NextResponse.json({ error: "Файл не знайдено у сховищі" }, { status: 400 });
    await uploadVariants(service, path, new Uint8Array(await blob.arrayBuffer()));
  }

  const { data: existing } = await service
    .from("photos")
    .select("id, storage_path")
    .eq("class_id", classId)
    .eq("category", category)
    .eq("filename", filename)
    .order("uploaded_at", { ascending: false })
    .limit(1);
  const previous = existing?.[0];

  if (previous) {
    const { error } = await service
      .from("photos")
      .update({ storage_path: path, file_type: fileType as never, uploaded_at: new Date().toISOString() })
      .eq("id", previous.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const old = [previous.storage_path, variantPath(previous.storage_path, "thumb"), variantPath(previous.storage_path, "preview")];
    await service.storage.from("photos").remove(old.filter((p): p is string => !!p && p !== path));
  } else {
    const { error } = await service.from("photos").insert({
      class_id: classId,
      storage_path: path,
      filename,
      file_type: fileType as never,
      category,
      student_id: studentId ?? null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, replaced: !!previous });
}
