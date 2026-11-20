import { NextResponse } from "next/server";
import { classJpegsForSession } from "@/lib/photo-access";

/**
 * GET /api/photos/[id]/download — завантажити оригінал JPEG одного фото.
 * Перенаправляє на короткоживуче підписане посилання Storage з
 * Content-Disposition: attachment, тож браузер зберігає файл під його назвою.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await classJpegsForSession([params.id]);
  if (!ctx) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  if (ctx === "blocked") return NextResponse.json({ error: "Завантаження фото для класу закрите" }, { status: 403 });
  const photo = ctx.photos[0];
  if (!photo) return NextResponse.json({ error: "Фото не знайдено" }, { status: 404 });

  const { data, error } = await ctx.supabase.storage
    .from("photos")
    .createSignedUrl(photo.storage_path, 300, { download: photo.filename });
  if (error || !data) return NextResponse.json({ error: "Не вдалося підготувати файл" }, { status: 500 });
  return NextResponse.redirect(data.signedUrl, 302);
}
