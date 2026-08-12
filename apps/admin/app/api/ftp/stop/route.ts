import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { stopFtp } from "@/lib/ftp-process-manager";

export async function POST() {
  const user = await requireAdmin("ftp");
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  return NextResponse.json(stopFtp());
}
