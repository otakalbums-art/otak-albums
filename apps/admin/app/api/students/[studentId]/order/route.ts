import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { requireAdmin } from "@/lib/require-admin";

const STATUSES = ["not_ordered", "ordered", "partially_paid", "paid", "free"] as const;

/**
 * PUT /api/students/[studentId]/order — статус замовлення/оплати альбому.
 * Body: { status: 'not_ordered'|'ordered'|'partially_paid'|'paid'|'free', amount?: number, paidAmount?: number }
 *
 * status — рівно те, що передав адмін, без автоперемикання (напр. навіть
 * якщо paidAmount >= amount, статус лишається таким, який обрали вручну).
 * amount — загальна сума (students.order_amount), дефолт з
 * album_types.price класу, якщо ще не задано. paidAmount — скільки
 * фактично внесено (students.paid_amount,
 * supabase/migrations/0006_album_edit_partial_payment_roles.sql) —
 * "залишок до сплати" рахується на клієнті як amount - paidAmount.
 * ordered_at/paid_at виставляються один раз, при першому переході в
 * відповідний статус — не перезаписуються назад.
 *
 * "free" (supabase/migrations/0008_free_order_status.sql) — альбом видано
 * без оплати (напр. класному керівнику): сума й внесок завжди 0, і в цьому
 * статусі учень повністю виключається з фінансової статистики на дашборді
 * (apps/admin/app/page.tsx) — без урахування amount/paidAmount з тіла запиту.
 */
export async function PUT(req: Request, { params }: { params: { studentId: string } }) {
  const user = await requireAdmin("crm");
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const { status, amount, paidAmount } = await req.json();
  if (!STATUSES.includes(status)) return NextResponse.json({ error: "Невірний статус" }, { status: 400 });

  const service = createSupabaseServiceRoleClient();

  const { data: student } = await service
    .from("students")
    .select("id, order_amount, paid_amount, ordered_at, paid_at, classes(album_types(price))")
    .eq("id", params.studentId)
    .maybeSingle();
  if (!student) return NextResponse.json({ error: "Учня не знайдено" }, { status: 404 });

  const update: Record<string, unknown> = { order_status: status };

  if (status === "free") {
    update.order_amount = 0;
    update.paid_amount = 0;
  } else {
    let resolvedAmount = amount !== undefined && amount !== null && amount !== "" ? Number(amount) : student.order_amount;
    if (resolvedAmount == null && status !== "not_ordered") {
      resolvedAmount = (student as any).classes?.album_types?.price ?? null;
    }
    update.order_amount = resolvedAmount;

    if (paidAmount !== undefined && paidAmount !== null && paidAmount !== "") {
      update.paid_amount = Number(paidAmount);
    }
  }

  const now = new Date().toISOString();
  if (status !== "not_ordered" && !student.ordered_at) update.ordered_at = now;
  if (status === "paid" && !student.paid_at) update.paid_at = now;

  const { error } = await service.from("students").update(update).eq("id", params.studentId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
