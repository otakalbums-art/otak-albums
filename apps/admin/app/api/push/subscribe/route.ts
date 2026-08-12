import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { requireAdmin } from "@/lib/require-admin";

/**
 * POST   /api/push/subscribe — зберегти підписку браузера/пристрою на push.
 * DELETE /api/push/subscribe — прибрати підписку (вимкнув перемикач).
 * Без конкретної вкладки в requireAdmin() — підписатись на сповіщення
 * може будь-який адмін, незалежно від ролі (сам набір подій, які він
 * реально отримає, і так фільтрується за tab_keys у packages/push).
 */
export async function POST(req: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const { endpoint, keys } = await req.json();
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: "Невірні дані підписки" }, { status: 400 });
  }

  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert({ admin_id: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth }, { onConflict: "endpoint" });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const { endpoint } = await req.json();
  if (!endpoint) return NextResponse.json({ error: "Не вказано endpoint" }, { status: 400 });

  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("admin_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
