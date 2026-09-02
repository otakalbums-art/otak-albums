import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { ftpStatus } from "@/lib/ftp-process-manager";
import { lanIps } from "@/lib/ftp-credentials";

export async function GET() {
  const user = await requireAdmin("ftp");
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  // Порядок важливий: локальний ftpStatus() не знає своїх ips/port (їх додає
  // lanIps()/FTP_PORT тут), а хмарний (проксі на VM) уже повертає ВЛАСНІ
  // ips/port (фіксована адреса сервера) — вони мають переважити дефолти.
  return NextResponse.json({
    ips: lanIps(),
    port: Number(process.env.FTP_PORT || 2121),
    ...(await ftpStatus()),
  });
}
