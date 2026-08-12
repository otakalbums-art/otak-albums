import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { requireAdmin } from "@/lib/require-admin";
import { transliterate } from "@/lib/slugify";

function slugify(name: string) {
  const base = transliterate(name).replace(/[^a-z0-9]+/g, "").slice(0, 10);
  return (base || "clas") + "-" + randomBytes(3).toString("hex");
}

/**
 * POST /api/classes — створення "папки класу".
 * Body: { schoolId?, newSchoolName?, albumTypeId, name }
 * (schoolId="" + newSchoolName -> спершу створюється школа).
 *
 * Реальної структури підпапок у Storage тут НЕ створюється навмисно: Supabase
 * Storage не потребує попереднього створення "порожніх папок" — шлях
 * {class_id}/{category}/... виникає автоматично під час першого завантаження
 * фото (apps/admin/app/api/photos/upload). Category — фіксований enum у схемі
 * (portrait/group/ceremony/personal/uncategorized), а не довільний
 * album_types.folder_template — тому "копіювання шаблону" звелось би до
 * косметичного списку назв, без впливу на реальні шляхи файлів.
 */
export async function POST(req: Request) {
  const user = await requireAdmin("classes");
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const { schoolId, newSchoolName, albumTypeId, name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Вкажіть назву класу" }, { status: 400 });
  if (!schoolId && !newSchoolName?.trim()) {
    return NextResponse.json({ error: "Оберіть школу або вкажіть назву нової" }, { status: 400 });
  }

  const supabase = createSupabaseServiceRoleClient();

  let resolvedSchoolId = schoolId as string | undefined;
  if (!resolvedSchoolId && newSchoolName?.trim()) {
    const { data: school, error: schoolError } = await supabase
      .from("schools")
      .insert({ name: newSchoolName.trim() })
      .select("id")
      .single();
    if (schoolError) return NextResponse.json({ error: schoolError.message }, { status: 400 });
    resolvedSchoolId = school.id;
  }

  const referralCode = slugify(name);

  const { data: klass, error } = await supabase
    .from("classes")
    .insert({
      school_id: resolvedSchoolId,
      album_type_id: albumTypeId || null,
      name: name.trim(),
      referral_code: referralCode,
    })
    .select("*, schools(name)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ class: klass });
}
