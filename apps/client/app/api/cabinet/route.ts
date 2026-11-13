import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServiceRoleClient } from "@otak/supabase";
import { allSlots, broadcastClassChange, hhmm, parseQuestions, parseTimeGroups } from "@otak/supabase/cabinet";

/**
 * Особистий кабінет дитини (батьків) — supabase/migrations/0013_parent_cabinet.sql.
 *
 * GET  /api/cabinet — дані групи: усі діти (лише перегляд), часові слоти,
 *                     анкета, фото-слоти альбому (якщо тип альбому обрано).
 * PUT  /api/cabinet — змінити ЛИШЕ свої дані: { shootTime?: "HH:MM" | null, answers?: {key: text} }.
 *
 * Авторизація: otak_session cookie -> students.session_token (як і решта
 * клієнтських API). Завдаток/доплату батьки не бачать.
 */

async function currentStudent() {
  const token = cookies().get("otak_session")?.value;
  if (!token) return null;
  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from("students")
    .select(
      "id, class_id, classes(id, name, status, album_type_id, shoot_date, time_groups, parent_editing_enabled, questions, schools(name))"
    )
    .eq("session_token", token)
    .maybeSingle();
  const klass = (data as any)?.classes;
  if (!data || !klass || klass.status === "archived") return null;
  return { supabase, studentId: data.id as string, klass };
}

export async function GET() {
  const ctx = await currentStudent();
  if (!ctx) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  const { supabase, studentId, klass } = ctx;

  const questions = parseQuestions(klass.questions);
  const timeGroups = parseTimeGroups(klass.time_groups);
  const slots = allSlots(timeGroups);

  const [{ data: students }, { data: photoSlots }, { count: photoCount }] = await Promise.all([
    supabase
      .from("students")
      .select("id, first_name, last_name, is_staff, staff_role, shoot_time")
      .eq("class_id", klass.id)
      .order("is_staff")
      .order("shoot_time", { nullsFirst: false })
      .order("last_name")
      .order("first_name"),
    klass.album_type_id
      ? supabase
          .from("album_type_slots")
          .select("id, label")
          .eq("album_type_id", klass.album_type_id)
          .eq("kind", "photo")
          .order("sort_order")
      : Promise.resolve({ data: [] as { id: string; label: string }[] }),
    supabase.from("photos").select("id", { count: "exact", head: true }).eq("class_id", klass.id).eq("file_type", "jpeg"),
  ]);

  const ids = (students ?? []).map((s) => s.id);
  const slotIds = (photoSlots ?? []).map((s) => s.id);

  const [{ data: answers }, { data: picks }, { data: ordered }] = await Promise.all([
    ids.length
      ? supabase.from("student_answers").select("student_id, question_key, answer").in("student_id", ids)
      : Promise.resolve({ data: [] as any[] }),
    ids.length && slotIds.length
      ? supabase
          .from("student_slot_photos")
          .select("student_id, slot_id, sort_order, photos(filename)")
          .in("student_id", ids)
          .in("slot_id", slotIds)
          .order("sort_order")
      : Promise.resolve({ data: [] as any[] }),
    ids.length
      ? supabase
          .from("student_options")
          .select("student_id, quantity, album_options(name)")
          .in("student_id", ids)
          .order("created_at")
      : Promise.resolve({ data: [] as any[] }),
  ]);

  // Додаткові послуги дітей — лише назва й кількість, без цін.
  const extrasBy = new Map<string, { name: string; quantity: number }[]>();
  for (const o of ordered ?? []) {
    const list = extrasBy.get(o.student_id) ?? [];
    // "(за шт.)" у назві — підказка до ціни для адміна; батькам цін не показуємо.
    const name = String((o as any).album_options?.name ?? "")
      .replace(/\s*\(\s*за\s+шт\.?\s*\)\s*/gi, " ")
      .trim();
    list.push({ name, quantity: o.quantity });
    extrasBy.set(o.student_id, list);
  }

  const answersBy = new Map<string, Record<string, string>>();
  for (const a of answers ?? []) {
    answersBy.set(a.student_id, { ...(answersBy.get(a.student_id) ?? {}), [a.question_key]: a.answer });
  }
  // Як у Google-таблиці: номери/назви обраних фото, без самих зображень.
  const picksBy = new Map<string, Record<string, string[]>>();
  for (const p of picks ?? []) {
    const bucket = picksBy.get(p.student_id) ?? {};
    const name = String(p.photos?.filename ?? "").replace(/\.[^.]+$/, "");
    bucket[p.slot_id] = [...(bucket[p.slot_id] ?? []), name];
    picksBy.set(p.student_id, bucket);
  }

  const rows = (students ?? []).map((s) => ({
    id: s.id,
    name: `${s.last_name} ${s.first_name}`,
    staffRole: s.is_staff ? s.staff_role ?? "Персонал" : null,
    shootTime: hhmm(s.shoot_time),
    answers: answersBy.get(s.id) ?? {},
    photos: picksBy.get(s.id) ?? {},
    extras: extrasBy.get(s.id) ?? [],
  }));

  const taken = Object.fromEntries(rows.filter((r) => r.shootTime).map((r) => [r.shootTime!, r.id]));

  return NextResponse.json({
    meId: studentId,
    class: {
      id: klass.id,
      name: klass.name,
      school: klass.schools?.name ?? "",
      shootDate: klass.shoot_date,
      editingEnabled: klass.parent_editing_enabled,
    },
    timeGroups,
    slots,
    taken,
    questions,
    photoSlots: photoSlots ?? [],
    hasPhotos: (photoCount ?? 0) > 0,
    rows,
  });
}

export async function PUT(req: Request) {
  const ctx = await currentStudent();
  if (!ctx) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  const { supabase, studentId, klass } = ctx;

  if (!klass.parent_editing_enabled) {
    return NextResponse.json({ error: "Редагування для групи закрите" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));

  if (body.shootTime !== undefined) {
    const slots = allSlots(parseTimeGroups(klass.time_groups)).map((s) => s.time);
    if (body.shootTime !== null && !slots.includes(body.shootTime)) {
      return NextResponse.json({ error: "Такого часу немає серед доступних" }, { status: 400 });
    }
    // Зайнятість перевіряє унікальний індекс (class_id, shoot_time) — без гонок між батьками.
    const { error } = await supabase
      .from("students")
      .update({ shoot_time: body.shootTime } as never)
      .eq("id", studentId);
    if (error) {
      const message = error.code === "23505" ? "Цей час щойно зайняли — оберіть інший" : error.message;
      return NextResponse.json({ error: message }, { status: error.code === "23505" ? 409 : 400 });
    }
  }

  if (body.answers && typeof body.answers === "object") {
    const allowed = new Set(parseQuestions(klass.questions).map((q) => q.key));
    const rows = Object.entries(body.answers as Record<string, unknown>)
      .filter(([key]) => allowed.has(key))
      .map(([key, value]) => ({
        student_id: studentId,
        question_key: key,
        answer: String(value ?? "").slice(0, 1000),
        updated_at: new Date().toISOString(),
      }));
    if (rows.length) {
      const { error } = await supabase.from("student_answers").upsert(rows);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  await broadcastClassChange(klass.id);
  return NextResponse.json({ ok: true });
}
