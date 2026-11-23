import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { loadGallery } from "@/lib/gallery-data";

/**
 * GET /api/photos/version — лише відбиток галереї ({ v: "…" }, кілька байтів).
 * Галерея опитує його раз на кілька секунд і перезавантажує повний
 * /api/photos тільки коли він змінився (нові фото, обране, перемикачі адміна).
 */
export async function GET() {
  const sessionToken = cookies().get("otak_session")?.value;
  if (!sessionToken) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  const g = await loadGallery(sessionToken);
  if (!g) return NextResponse.json({ error: "Сесія недійсна" }, { status: 401 });
  return NextResponse.json({ v: g.version }, { headers: { "Cache-Control": "no-store" } });
}
