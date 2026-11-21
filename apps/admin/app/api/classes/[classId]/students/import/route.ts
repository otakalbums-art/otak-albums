import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { requireAdmin } from "@/lib/require-admin";
import { broadcastClassChange } from "@/lib/class-realtime";

const TIME_RE = /^\d{2}:\d{2}$/;

/**
 * POST /api/classes/[classId]/students/import — додати дітей списком
 * (імпорт PDF/CSV у CRM, crm/import-students.tsx).
 * Body: { rows: [{ lastName, firstName, shootTime: "HH:MM" | null }] }
 * Діти, які вже є в класі (те саме прізвище й ім'я), пропускаються; час,
 * уже зайнятий іншою дитиною, не ставиться (дитина додається без часу).
 */
export async function POST(req: Request, { params }: { params: { classId: string } }) {
  const user = await requireAdmin("crm");
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const { rows } = await req.json().catch(() => ({ rows: null }));
  if (!Array.isArray(rows) || !rows.length) return NextResponse.json({ error: "Список порожній" }, { status: 400 });
  if (rows.length > 300) return NextResponse.json({ error: "Не більше 300 дітей за раз" }, { status: 400 });

  const service = createSupabaseServiceRoleClient();
  const { data: existing } = await service
    .from("students")
    .select("first_name, last_name, shoot_time")
    .eq("class_id", params.classId);
  const key = (l: string, f: string) => `${l.trim().toLowerCase()}|${f.trim().toLowerCase()}`;
  const names = new Set((existing ?? []).map((s) => key(s.last_name, s.first_name)));
  const times = new Set((existing ?? []).map((s) => (s.shoot_time ? String(s.shoot_time).slice(0, 5) : null)).filter(Boolean));

  const skipped: string[] = [];
  const timeTaken: string[] = [];
  const insert: { class_id: string; first_name: string; last_name: string; shoot_time: string | null; is_staff: boolean }[] = [];
  for (const r of rows) {
    const lastName = String(r?.lastName ?? "").trim().slice(0, 80);
    const firstName = String(r?.firstName ?? "").trim().slice(0, 80);
    if (!lastName || !firstName) continue;
    const label = `${lastName} ${firstName}`;
    if (names.has(key(lastName, firstName))) {
      skipped.push(label);
      continue;
    }
    names.add(key(lastName, firstName));
    let shootTime: string | null = TIME_RE.test(r?.shootTime ?? "") ? r.shootTime : null;
    if (shootTime && times.has(shootTime)) {
      timeTaken.push(`${label} (${shootTime})`);
      shootTime = null;
    }
    if (shootTime) times.add(shootTime);
    insert.push({ class_id: params.classId, first_name: firstName, last_name: lastName, shoot_time: shootTime, is_staff: false });
  }

  if (insert.length) {
    const { error } = await service.from("students").insert(insert as never);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await broadcastClassChange(params.classId);
  }
  return NextResponse.json({ added: insert.length, skipped, timeTaken });
}
