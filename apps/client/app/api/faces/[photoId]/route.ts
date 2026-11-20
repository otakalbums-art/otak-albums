import { NextResponse } from "next/server";
import { faceContext } from "@/lib/face-access";

/**
 * GET /api/faces/[photoId] — обличчя, знайдені на фото: рамки (частки кадру
 * 0..1), щоб батьки вибрали свою дитину. Самі «відбитки» не віддаються.
 * analyzed=false — сервер ще не обробив це фото.
 */
export async function GET(_req: Request, { params }: { params: { photoId: string } }) {
  const ctx = await faceContext();
  if (!ctx) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  if (ctx === "closed") return NextResponse.json({ error: "Перегляд фото закритий" }, { status: 403 });

  const { data: photo } = await ctx.supabase
    .from("photos")
    .select("id, class_id, faces_analyzed_at")
    .eq("id", params.photoId)
    .maybeSingle();
  if (!photo || photo.class_id !== ctx.classId) return NextResponse.json({ error: "Фото не знайдено" }, { status: 404 });

  const { data: faces } = await ctx.supabase
    .from("photo_faces")
    .select("face_index, box")
    .eq("photo_id", params.photoId)
    .order("face_index");
  return NextResponse.json({ analyzed: !!photo.faces_analyzed_at, faces: faces ?? [], consent: ctx.consent });
}
