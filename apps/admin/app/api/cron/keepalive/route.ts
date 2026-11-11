import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";

/**
 * GET /api/cron/keepalive — щоденний пінг бази, щоб безкоштовний проєкт
 * Supabase не "засинав" (Free-план ставить на паузу після 7 днів без
 * активності). Викликається Vercel Cron за розкладом з apps/admin/vercel.json.
 *
 * ТИМЧАСОВО: після переходу Supabase на Pro цей роут і блок "crons" у
 * vercel.json можна видалити.
 *
 * Робить справжній запит до Postgres (а не лише health-check), щоб
 * активність точно зарахувалась. Якщо на Vercel задано CRON_SECRET,
 * Vercel сам додає заголовок Authorization: Bearer <CRON_SECRET>, і ми
 * його перевіряємо; без змінної роут відкритий, але нічого не розкриває.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from("schools").select("id", { head: true, count: "exact" });

  if (error) {
    console.error("[keepalive] Supabase query failed:", error.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}
