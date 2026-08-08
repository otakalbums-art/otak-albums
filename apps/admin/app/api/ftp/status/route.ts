import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { ftpStatus } from "@/lib/ftp-process-manager";
import { lanIps } from "@/lib/ftp-credentials";

export async function GET() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  return NextResponse.json({
    ...ftpStatus(),
    ips: lanIps(),
    port: Number(process.env.FTP_PORT || 2121),
  });
}
