import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { requireAdmin } from "@/lib/require-admin";
import { parseMarkupBody } from "@/lib/album-catalog";

/** POST /api/album-markups — додати правило націнки за малий тираж. Body: { minAlbums?, maxAlbums?, surcharge } */
export async function POST(req: Request) {
  const user = await requireAdmin("album_types");
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const parsed = parseMarkupBody(await req.json(), false);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service
    .from("album_small_run_markups")
    .insert(parsed.values as never)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ markup: data });
}
