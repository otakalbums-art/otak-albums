import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { requireAdmin } from "@/lib/require-admin";
import { parseOptionBody } from "@/lib/album-catalog";

/** PATCH /api/album-options/[id] — змінити назву/категорію/ціну опції. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireAdmin("album_types");
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const parsed = parseOptionBody(await req.json(), true);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service
    .from("album_options")
    .update(parsed.values as never)
    .eq("id", params.id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ option: data });
}

/** DELETE /api/album-options/[id] */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireAdmin("album_types");
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const service = createSupabaseServiceRoleClient();
  const { error } = await service.from("album_options").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
