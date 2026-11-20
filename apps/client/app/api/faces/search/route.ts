import { NextResponse } from "next/server";
import { findChildPhotos, loadClassFaces } from "@otak/supabase/faces";
import { faceContext } from "@/lib/face-access";

/**
 * POST /api/faces/search { photoId, faceIndex } — «Знайти мою дитину»:
 * id усіх видимих фото класу з цією дитиною. Лише за згодою батьків.
 * Логіка порівняння — packages/supabase/src/faces.ts.
 */
export async function POST(req: Request) {
  const ctx = await faceContext();
  if (!ctx) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  if (ctx === "closed") return NextResponse.json({ error: "Перегляд фото закритий" }, { status: 403 });
  if (!ctx.consent) return NextResponse.json({ error: "Потрібна згода на пошук за обличчям", needConsent: true }, { status: 403 });

  const { photoId, faceIndex } = await req.json().catch(() => ({}));
  if (!photoId || !Number.isInteger(faceIndex)) return NextResponse.json({ error: "Невірний запит" }, { status: 400 });

  const [photos, faces] = await Promise.all([ctx.visiblePhotos(), loadClassFaces(ctx.supabase, ctx.classId)]);
  const ids = findChildPhotos(photos, faces, String(photoId), faceIndex);
  if (!ids) return NextResponse.json({ error: "Обличчя на цьому фото не знайдено" }, { status: 404 });

  const analyzedPhotos = new Set(faces.map((f) => f.photo_id)).size;
  return NextResponse.json({ ids, analyzedPhotos, totalPhotos: photos.length });
}
