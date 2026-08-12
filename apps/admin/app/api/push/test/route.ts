import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { requireAdmin } from "@/lib/require-admin";
import { sendTestToAdmin } from "@otak/push";

/** POST /api/push/test — тестове сповіщення лише самому собі (кнопка "Надіслати тестове"). */
export async function POST() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const supabase = createSupabaseServiceRoleClient();
  const { data: subs } = await supabase.from("push_subscriptions").select("id").eq("admin_id", user.id);
  if (!subs || subs.length === 0) {
    return NextResponse.json({ error: "Немає активної підписки на цьому пристрої" }, { status: 400 });
  }

  await sendTestToAdmin(supabase, user.id);
  return NextResponse.json({ ok: true });
}
