import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { requireAdmin } from "@/lib/require-admin";

/** POST /api/mom-links/[id] — локальний тогл { isActive }. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const { isActive } = await req.json();
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from("mom_links").update({ is_active: !!isActive }).eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
