import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { requireAdmin } from "@/lib/require-admin";

/** POST /api/mom-links/global — глобальний перемикач { disabled }. */
export async function POST(req: Request) {
  const user = await requireAdmin("mom_links");
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const { disabled } = await req.json();
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from("global_settings")
    .update({ mom_links_globally_disabled: !!disabled, updated_at: new Date().toISOString() })
    .eq("id", true);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
