import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { requireAdmin } from "@/lib/require-admin";

/**
 * GET /api/classes/[classId]/crm — CRM-таблиця класу: слоти типу альбому
 * цього класу (apps/admin/app/album-types/[albumTypeId]/slots) + значення
 * (фото/текст) кожного учня, і персоналу (is_staff) — заміна ручних
 * Google Sheets на кшталт "9-А_2026". Прогрес відбору для кожного учня
 * рахується на клієнті з values (щоб не дублювати той самий підрахунок
 * двома різними запитами).
 */
export async function GET(_req: Request, { params }: { params: { classId: string } }) {
  const user = await requireAdmin("crm");
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const service = createSupabaseServiceRoleClient();

  const { data: klass } = await service
    .from("classes")
    .select("id, album_type_id")
    .eq("id", params.classId)
    .maybeSingle();

  if (!klass) return NextResponse.json({ error: "Клас не знайдено" }, { status: 404 });
  if (!klass.album_type_id) return NextResponse.json({ slots: [], students: [] });

  const { data: slots } = await service
    .from("album_type_slots")
    .select("id, key, label, kind, max_photos, filled_by, sort_order")
    .eq("album_type_id", klass.album_type_id)
    .order("sort_order");

  const { data: students } = await service
    .from("students")
    .select("id, first_name, last_name, is_staff, staff_role, order_status, order_amount, paid_amount, selection_confirmed_at")
    .eq("class_id", params.classId)
    .order("is_staff")
    .order("last_name")
    .order("first_name");

  const studentIds = (students ?? []).map((s: any) => s.id);
  const slotIds = (slots ?? []).map((s: any) => s.id);

  const [{ data: slotPhotos }, { data: slotAnswers }] = await Promise.all([
    studentIds.length && slotIds.length
      ? service
          .from("student_slot_photos")
          .select("student_id, slot_id, sort_order, photos(id, filename, storage_path)")
          .in("student_id", studentIds)
          .in("slot_id", slotIds)
          .order("sort_order")
      : Promise.resolve({ data: [] as any[] }),
    studentIds.length && slotIds.length
      ? service
          .from("student_slot_answers")
          .select("student_id, slot_id, answer")
          .in("student_id", studentIds)
          .in("slot_id", slotIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  // Signed URLs для всіх фото, задіяних у слотах — одним батчем, як і в
  // /api/classes/[classId]/photos.
  const paths = (slotPhotos ?? []).map((sp: any) => sp.photos?.storage_path).filter(Boolean);
  const { data: signedUrls } = paths.length
    ? await service.storage.from("photos").createSignedUrls(paths, 60 * 60)
    : { data: [] as any[] };
  const urlByPath = new Map((signedUrls ?? []).map((s: any) => [s.path, s.signedUrl]));

  const valuesByStudent = new Map<string, Record<string, any>>();
  for (const student of students ?? []) {
    valuesByStudent.set(student.id, {});
  }

  for (const sp of slotPhotos ?? []) {
    const bucket = valuesByStudent.get(sp.student_id);
    if (!bucket || !sp.photos) continue;
    const entry = bucket[sp.slot_id] ?? { kind: "photo", photos: [] };
    entry.photos.push({
      id: sp.photos.id,
      filename: sp.photos.filename,
      url: urlByPath.get(sp.photos.storage_path) ?? null,
    });
    bucket[sp.slot_id] = entry;
  }

  for (const sa of slotAnswers ?? []) {
    const bucket = valuesByStudent.get(sa.student_id);
    if (!bucket) continue;
    bucket[sa.slot_id] = { kind: "text", answer: sa.answer };
  }

  const mappedStudents = (students ?? []).map((s: any) => ({
    id: s.id,
    first_name: s.first_name,
    last_name: s.last_name,
    is_staff: s.is_staff,
    staff_role: s.staff_role,
    order_status: s.order_status,
    order_amount: s.order_amount,
    paid_amount: s.paid_amount,
    selection_confirmed_at: s.selection_confirmed_at,
    values: valuesByStudent.get(s.id) ?? {},
  }));

  return NextResponse.json({ slots: slots ?? [], students: mappedStudents });
}
