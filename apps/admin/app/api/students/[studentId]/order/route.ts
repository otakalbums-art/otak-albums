import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { requireAdmin } from "@/lib/require-admin";
import { broadcastStudentChange } from "@/lib/class-realtime";
import { notifyAdmins } from "@otak/push";

const STATUSES = ["not_ordered", "ordered", "partially_paid", "paid", "free"] as const;
const STATUS_LABEL: Record<string, string> = {
  not_ordered: "Не замовили",
  ordered: "Замовили",
  partially_paid: "Частково оплатили",
  paid: "Оплатили повністю",
  free: "Безкоштовно",
};

/**
 * PUT /api/students/[studentId]/order — статус замовлення/оплати альбому.
 * Body: { status: 'not_ordered'|'ordered'|'partially_paid'|'paid'|'free', amount?: number }
 *
 * status — рівно те, що передав адмін, без автоперемикання (навіть якщо
 * внесено >= amount, статус лишається таким, який обрали вручну).
 * amount — загальна сума (students.order_amount), дефолт з
 * album_types.price класу, якщо ще не задано. Скільки внесено
 * (students.paid_amount) — завжди завдаток + доплата, їх вносить адмін через
 * PATCH /api/students/[studentId]; залишок = amount - paid_amount.
 * ordered_at/paid_at виставляються один раз, при першому переході в
 * відповідний статус — не перезаписуються назад.
 *
 * "free" (supabase/migrations/0008_free_order_status.sql) — альбом видано
 * без оплати (напр. класному керівнику): сума й внесок завжди 0, і в цьому
 * статусі учень повністю виключається з фінансової статистики на дашборді
 * (apps/admin/app/page.tsx); завдаток і доплата обнуляються.
 */
export async function PUT(req: Request, { params }: { params: { studentId: string } }) {
  const user = await requireAdmin("crm");
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const { status, amount } = await req.json();
  if (!STATUSES.includes(status)) return NextResponse.json({ error: "Невірний статус" }, { status: 400 });

  const service = createSupabaseServiceRoleClient();

  const { data: student } = await service
    .from("students")
    .select("id, first_name, last_name, order_status, order_amount, paid_amount, ordered_at, paid_at, classes(id, name, album_types(price))")
    .eq("id", params.studentId)
    .maybeSingle();
  if (!student) return NextResponse.json({ error: "Учня не знайдено" }, { status: 404 });

  const update: Record<string, unknown> = { order_status: status };

  // "Внесено" (paid_amount) = завдаток + доплата — рахує тригер у БД
  // (supabase/migrations/0013_parent_cabinet.sql), тут його не задаємо.
  if (status === "free") {
    update.order_amount = 0;
    update.deposit_amount = 0;
    update.extra_payment_amount = 0;
  } else {
    let resolvedAmount = amount !== undefined && amount !== null && amount !== "" ? Number(amount) : student.order_amount;
    if (resolvedAmount == null && status !== "not_ordered") {
      resolvedAmount = (student as any).classes?.album_types?.price ?? null;
    }
    update.order_amount = resolvedAmount;
  }

  const now = new Date().toISOString();
  if (status !== "not_ordered" && !student.ordered_at) update.ordered_at = now;
  if (status === "paid" && !student.paid_at) update.paid_at = now;

  const { error } = await service.from("students").update(update as never).eq("id", params.studentId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (status !== student.order_status) {
    const klass = (student as any).classes;
    notifyAdmins(service, {
      tab: "crm",
      excludeAdminId: user.id,
      title: "Статус оплати змінився",
      body: `${student.last_name} ${student.first_name} (${klass?.name ?? "клас"}): ${STATUS_LABEL[student.order_status] ?? student.order_status} → ${STATUS_LABEL[status] ?? status}`,
      url: `/classes/${klass?.id}/crm`,
    }).catch((err) => console.error("[push] order status notify:", err));
  }

  await broadcastStudentChange(params.studentId);
  return NextResponse.json({ ok: true });
}
