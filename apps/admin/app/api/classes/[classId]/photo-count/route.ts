import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@otak/supabase/server";
import { requireAdmin } from "@/lib/require-admin";

/**
 * GET /api/classes/[classId]/photo-count — використовується для опитування
 * "жива" лічильника на /ftp-import замість Supabase Realtime (той же привід,
 * що й для галереї учня, див. apps/client/app/gallery/page.tsx — тут це не
 * RLS-проблема, адмін і так має повний доступ, а просто послідовність:
 * простіше опитувати той самий шлях скрізь, ніж тримати дві різні стратегії).
 */
export async function GET(req: Request, { params }: { params: { classId: string } }) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const supabase = createSupabaseServerClient();
  const { count } = await supabase
    .from("photos")
    .select("id", { count: "exact", head: true })
    .eq("class_id", params.classId);

  return NextResponse.json({ count: count ?? 0 });
}
