import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { notifyAdmins } from "@otak/push";

/**
 * POST /api/push/internal — push-сповіщення від сервера камер (DigitalOcean):
 * ftp-ingest.mjs (камера не передає, місце на диску) і face-worker.py
 * (обличчя проаналізовано, бракує кадрів). Сам сервер не має VAPID-ключів,
 * тож просить адмінку розіслати. Захист — той самий FTP_CONTROL_SECRET, яким
 * адмінка керує приймачем (Bearer).
 * Body: { tab, title, body, url }
 */
const TABS = ["ftp", "classes", "crm", "mom_links"];

function authorized(req: Request) {
  const secret = process.env.FTP_CONTROL_SECRET?.trim();
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { tab, title, body, url } = await req.json().catch(() => ({}));
  if (!TABS.includes(tab) || typeof title !== "string" || typeof body !== "string") {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  await notifyAdmins(createSupabaseServiceRoleClient(), {
    tab,
    title: title.slice(0, 120),
    body: body.slice(0, 400),
    url: typeof url === "string" && url.startsWith("/") ? url : "/",
  });
  return NextResponse.json({ ok: true });
}
