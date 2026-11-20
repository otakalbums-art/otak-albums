import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { requireAdmin } from "@/lib/require-admin";
import { detectFileType, folderFor, frameKey } from "@/lib/file-type";

const CATEGORIES = ["portrait", "group", "ceremony", "personal", "uncategorized"];

/**
 * POST /api/photos/upload-urls — підписані посилання для прямого
 * завантаження файлів із браузера в Storage (без проходження через Vercel,
 * у якого ліміт ~4,5 МБ на запит — RAW по ~20 МБ туди не пролазить).
 *
 * Body: { classId, category, studentId?, files: string[] (імена), onlyNew?: boolean }
 * onlyNew (за замовчуванням true) — файли, назва яких уже є в класі, не
 * вантажимо зовсім (для дозавантаження загублених кадрів з картки:
 * фотограф обирає все, а приходить лише те, чого бракує).
 * RAW автоматично отримує категорію/учня свого JPEG (та сама назва без
 * розширення) — фотограф може просто вивантажити RAW з картки, і вони
 * стануть у пару. Без JPEG — обрана категорія.
 */
export async function POST(req: Request) {
  const user = await requireAdmin("classes");
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const { classId, category, studentId, files, onlyNew = true } = await req.json();
  if (!classId || !Array.isArray(files) || !files.length) {
    return NextResponse.json({ error: "Немає файлів" }, { status: 400 });
  }
  if (!CATEGORIES.includes(category)) return NextResponse.json({ error: "Невірна категорія" }, { status: 400 });
  if (category === "personal" && !studentId) {
    return NextResponse.json({ error: "Для персональної категорії потрібен учень" }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();

  // Усі файли класу: які назви вже є, і де лежить "пара" кожного кадру —
  // RAW стає поруч зі своїм JPEG, а дозавантажений JPEG — поруч зі своїм RAW.
  const existingNames = new Set<string>();
  const jpegByKey = new Map<string, { category: string; student_id: string | null }>();
  const rawByKey = new Map<string, { category: string; student_id: string | null }>();
  for (let from = 0; ; from += 1000) {
    const { data } = await service
      .from("photos")
      .select("filename, file_type, category, student_id")
      .eq("class_id", classId)
      .range(from, from + 999);
    for (const p of data ?? []) {
      existingNames.add(p.filename.toLowerCase());
      const target = p.file_type === "jpeg" ? jpegByKey : rawByKey;
      target.set(frameKey(p.filename), { category: p.category, student_id: p.student_id });
    }
    if (!data || data.length < 1000) break;
  }
  // JPEG з цієї ж пачки (раптом фотограф вивантажує обидва формати разом).
  for (const name of files as string[]) {
    if (detectFileType(name) === "jpeg") {
      jpegByKey.set(frameKey(name), { category, student_id: category === "personal" ? studentId : null });
    }
  }

  const items = await Promise.all(
    (files as string[]).map(async (name) => {
      const fileType = detectFileType(name);
      if (!fileType) return { name, error: "непідтримуваний тип файлу (не JPEG і не відомий RAW-формат)" };
      if (onlyNew && existingNames.has(name.toLowerCase())) return { name, exists: true };

      const match = fileType !== "jpeg" ? jpegByKey.get(frameKey(name)) : rawByKey.get(frameKey(name));
      const fileCategory = match?.category ?? category;
      const fileStudent = match ? match.student_id : category === "personal" ? studentId : null;
      const path = `${classId}/${fileCategory}/${folderFor(fileType)}/${randomUUID()}-${name}`;

      const { data, error } = await service.storage.from("photos").createSignedUploadUrl(path);
      if (error || !data) return { name, error: error?.message ?? "не вдалося підготувати завантаження" };
      return {
        name,
        path,
        token: data.token,
        fileType,
        category: fileCategory,
        studentId: fileStudent,
        paired: !!match,
      };
    })
  );

  return NextResponse.json({ items });
}
