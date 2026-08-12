import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { requireAdmin } from "@/lib/require-admin";

/** POST /api/mom-links/[id] — локальний тогл { isActive }. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await requireAdmin("mom_links");
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const { isActive } = await req.json();
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from("mom_links").update({ is_active: !!isActive }).eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/mom-links/[id] — видаляє посилання остаточно (не просто
 * вимикає), щоб старі/непотрібні рядки не накопичувались в адмінці.
 * Прострочені/вимкнені посилання й так нікого нікуди не пускають, це лише
 * прибирання списку — фото самі не чіпаються, видаляється тільки рядок
 * mom_links.
 */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireAdmin("mom_links");
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from("mom_links").delete().eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

/**
 * PATCH /api/mom-links/[id] — змінити термін дії { hours }, рахуючи
 * від часу створення посилання (created_at + hours), як і при створенні —
 * не від "зараз", щоб "72 год" завжди означало те саме, скільки б разів
 * адмін не редагував це поле.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireAdmin("mom_links");
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const { hours } = await req.json();
  const h = Number(hours);
  if (!h || h <= 0) return NextResponse.json({ error: "Потрібне додатне число годин" }, { status: 400 });

  const supabase = createSupabaseServiceRoleClient();
  const { data: link } = await supabase.from("mom_links").select("created_at").eq("id", params.id).maybeSingle();
  if (!link) return NextResponse.json({ error: "Посилання не знайдено" }, { status: 404 });

  const expiresAt = new Date(new Date(link.created_at).getTime() + h * 60 * 60 * 1000);
  const { error } = await supabase
    .from("mom_links")
    .update({ expires_at: expiresAt.toISOString() })
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
