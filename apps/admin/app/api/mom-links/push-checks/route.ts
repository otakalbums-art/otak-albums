import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { requireAdmin } from "@/lib/require-admin";

/**
 * POST /api/mom-links/push-checks — увімкнути/вимкнути автоматичні
 * push-нагадування про закінчення посилань { enabled }. Сама перевірка
 * (apps/admin/lib/push-scheduler.ts) тікає завжди, поки живий сервер —
 * цей перемикач лише гейтує, чи вона реально щось надсилає.
 */
export async function POST(req: Request) {
  const user = await requireAdmin("mom_links");
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const { enabled } = await req.json();
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from("global_settings")
    .update({ push_mom_link_checks_enabled: !!enabled, updated_at: new Date().toISOString() })
    .eq("id", true);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
