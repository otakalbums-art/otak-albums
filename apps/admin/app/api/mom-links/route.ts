import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { requireAdmin } from "@/lib/require-admin";
import { schedulerLastCheckAt } from "@/lib/push-scheduler";

/**
 * GET  /api/mom-links  — список посилань + перелік активних класів (для форми
 *                        створення) + стан глобального перемикача.
 * POST /api/mom-links  — створити нове посилання { classId, hours }.
 */
export async function GET() {
  const user = await requireAdmin("mom_links");
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const supabase = createSupabaseServiceRoleClient();

  const { data: links } = await supabase
    .from("mom_links")
    .select("id, token, expires_at, is_active, created_at, classes(name)")
    .order("created_at", { ascending: false });

  const { data: settings } = await supabase
    .from("global_settings")
    .select("mom_links_globally_disabled, push_mom_link_checks_enabled")
    .single();

  const { data: classes } = await supabase.from("classes").select("id, name").eq("status", "active").order("name");

  const mapped = (links ?? []).map((l: any) => ({
    id: l.id,
    token: l.token,
    class_name: l.classes?.name ?? "—",
    hours: Math.max(1, Math.round((new Date(l.expires_at).getTime() - new Date(l.created_at).getTime()) / 3_600_000)),
    expires_at: l.expires_at,
    is_active: l.is_active,
  }));

  return NextResponse.json({
    links: mapped,
    globalDisabled: !!settings?.mom_links_globally_disabled,
    pushChecksEnabled: settings?.push_mom_link_checks_enabled ?? true,
    pushLastCheckAt: schedulerLastCheckAt(),
    classes: classes ?? [],
  });
}

export async function POST(req: Request) {
  const user = await requireAdmin("mom_links");
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const { classId, hours } = await req.json();
  const h = Number(hours);
  if (!classId || !h || h <= 0) {
    return NextResponse.json({ error: "Потрібні classId і додатне число годин" }, { status: 400 });
  }

  const supabase = createSupabaseServiceRoleClient();
  const token = randomBytes(12).toString("hex");
  const expiresAt = new Date(Date.now() + h * 60 * 60 * 1000);

  const { data: link, error } = await supabase
    .from("mom_links")
    .insert({ class_id: classId, token, expires_at: expiresAt.toISOString(), is_active: true })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ link });
}
