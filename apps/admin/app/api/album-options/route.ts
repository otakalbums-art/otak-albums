import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { requireAdmin } from "@/lib/require-admin";
import { parseOptionBody } from "@/lib/album-catalog";

/** POST /api/album-options — додати додаткову опцію. Body: { name, category?, price?, sortOrder? } */
export async function POST(req: Request) {
  const user = await requireAdmin("album_types");
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const parsed = parseOptionBody(await req.json(), false);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service.from("album_options").insert(parsed.values as never).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ option: data });
}
