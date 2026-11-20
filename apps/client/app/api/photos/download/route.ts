import { NextResponse } from "next/server";
import { classJpegsForSession } from "@/lib/photo-access";

const MAX = 500;

/**
 * POST /api/photos/download { ids: string[] } — підписані посилання на
 * оригінали JPEG вибраних фото. Браузер сам їх завантажує й пакує в ZIP
 * (через Vercel файли не йдуть — там ліміт ~4,5 МБ на відповідь).
 */
export async function POST(req: Request) {
  const { ids } = await req.json().catch(() => ({ ids: null }));
  if (!Array.isArray(ids) || !ids.length) return NextResponse.json({ error: "Не вибрано фото" }, { status: 400 });
  if (ids.length > MAX) return NextResponse.json({ error: `Не більше ${MAX} фото за раз` }, { status: 400 });

  const ctx = await classJpegsForSession(ids.map(String));
  if (!ctx) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  if (ctx === "blocked") return NextResponse.json({ error: "Завантаження фото для класу закрите" }, { status: 403 });

  const paths = ctx.photos.map((p) => p.storage_path);
  const { data: signed } = paths.length
    ? await ctx.supabase.storage.from("photos").createSignedUrls(paths, 60 * 30)
    : { data: [] as { path: string | null; signedUrl: string }[] };
  const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  const files = ctx.photos
    .map((p) => ({ id: p.id, filename: p.filename, url: urlByPath.get(p.storage_path) }))
    .filter((f): f is { id: string; filename: string; url: string } => !!f.url);
  return NextResponse.json({ files });
}
