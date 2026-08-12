import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { requireAdmin } from "@/lib/require-admin";
import { detectFileType, folderFor } from "@/lib/file-type";

const ALLOWED_CATEGORIES = ["portrait", "group", "ceremony", "personal", "uncategorized"] as const;
type Category = (typeof ALLOWED_CATEGORIES)[number];

/**
 * POST /api/photos/upload (адмінка)
 * FormData: classId, category, studentId? (обов'язково для category="personal"),
 * files[] (JPEG або RAW — див. lib/file-type.ts, до 50MB кожен)
 *
 * Авторизація: Supabase Auth-сесія адміна (cookie) -> перевірка admin_users.
 * Сам запис у Storage/БД іде через service_role client (bucket "photos" приватний,
 * без RLS-policy на storage.objects — увесь доступ навмисно проходить лише через
 * цей route handler, за аналогією з student-facing API, див. docs/auth-strategy.md).
 *
 * Кожен файл лягає у Storage за шляхом
 * {classId}/{category}/{JPEG|RAW}/{uuid}-{filename} — підпапку за типом
 * система обирає сама за розширенням файлу, вручну вказувати не треба.
 */
export async function POST(req: Request) {
  const user = await requireAdmin("classes");
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const formData = await req.formData();
  const classId = formData.get("classId")?.toString();
  const category = formData.get("category")?.toString() as Category | undefined;
  const studentId = formData.get("studentId")?.toString() || null;
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);

  if (!classId) return NextResponse.json({ error: "Не вказано клас" }, { status: 400 });
  if (!category || !ALLOWED_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "Невірна категорія" }, { status: 400 });
  }
  if (category === "personal" && !studentId) {
    return NextResponse.json({ error: "Для персональної категорії потрібен учень" }, { status: 400 });
  }
  if (files.length === 0) return NextResponse.json({ error: "Не передано файлів" }, { status: 400 });

  const service = createSupabaseServiceRoleClient();
  const inserted: { filename: string }[] = [];
  const skipped: { filename: string; reason: string }[] = [];

  for (const file of files) {
    const fileType = detectFileType(file.name);
    if (!fileType) {
      skipped.push({ filename: file.name, reason: "непідтримуваний тип файлу (не JPEG і не відомий RAW-формат)" });
      continue;
    }

    const storagePath = `${classId}/${category}/${folderFor(fileType)}/${randomUUID()}-${file.name}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const contentType = fileType === "jpeg" ? "image/jpeg" : "application/octet-stream";

    const { error: uploadError } = await service.storage
      .from("photos")
      .upload(storagePath, bytes, { contentType, upsert: false });

    if (uploadError) {
      skipped.push({ filename: file.name, reason: uploadError.message });
      continue;
    }

    const { error: insertError } = await service.from("photos").insert({
      class_id: classId,
      storage_path: storagePath,
      filename: file.name,
      file_type: fileType,
      category,
      student_id: category === "personal" ? studentId : null,
    });

    if (insertError) {
      skipped.push({ filename: file.name, reason: insertError.message });
      continue;
    }

    inserted.push({ filename: file.name });
  }

  return NextResponse.json({ inserted, skipped });
}
