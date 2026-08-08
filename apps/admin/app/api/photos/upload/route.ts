import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { requireAdmin } from "@/lib/require-admin";

const ALLOWED_CATEGORIES = ["portrait", "group", "ceremony", "personal", "uncategorized"] as const;
type Category = (typeof ALLOWED_CATEGORIES)[number];

/**
 * POST /api/photos/upload (адмінка)
 * FormData: classId, category, studentId? (обов'язково для category="personal"), files[] (JPEG, до 50MB кожен)
 *
 * Авторизація: Supabase Auth-сесія адміна (cookie) -> перевірка admin_users.
 * Сам запис у Storage/БД іде через service_role client (bucket "photos" приватний,
 * без RLS-policy на storage.objects — увесь доступ навмисно проходить лише через
 * цей route handler, за аналогією з student-facing API, див. docs/auth-strategy.md).
 */
export async function POST(req: Request) {
  const user = await requireAdmin();
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
    const isJpeg = file.type === "image/jpeg" || /\.jpe?g$/i.test(file.name);
    if (!isJpeg) {
      skipped.push({ filename: file.name, reason: "не JPEG" });
      continue;
    }

    const storagePath = `${classId}/${category}/${randomUUID()}-${file.name}`;
    const bytes = new Uint8Array(await file.arrayBuffer());

    const { error: uploadError } = await service.storage
      .from("photos")
      .upload(storagePath, bytes, { contentType: "image/jpeg", upsert: false });

    if (uploadError) {
      skipped.push({ filename: file.name, reason: uploadError.message });
      continue;
    }

    const { error: insertError } = await service.from("photos").insert({
      class_id: classId,
      storage_path: storagePath,
      filename: file.name,
      file_type: "jpeg",
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
