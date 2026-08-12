import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServiceRoleClient } from "@otak/supabase";

/**
 * PUT /api/album-slots/[slotId] — учень призначає слоту фото зі своїх
 * favorites. Body: { photoIds: string[] }
 *
 * Перевірки: слот — kind='photo' типу альбому класу учня; кожен photoId —
 * серед favorites цього учня (не можна підсунути чуже/непозначене фото);
 * не більше slot.max_photos. Будь-яка зміна скидає
 * students.selection_confirmed_at — підтверджений відбір мусить точно
 * відповідати тому, що учень явно затвердив.
 */
export async function PUT(req: Request, { params }: { params: { slotId: string } }) {
  const sessionToken = cookies().get("otak_session")?.value;
  if (!sessionToken) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });

  const { photoIds } = await req.json();
  if (!Array.isArray(photoIds)) return NextResponse.json({ error: "photoIds має бути масивом" }, { status: 400 });

  const supabase = createSupabaseServiceRoleClient();
  const { data: student } = await supabase
    .from("students")
    .select("id, classes(album_type_id)")
    .eq("session_token", sessionToken)
    .single();
  if (!student) return NextResponse.json({ error: "Сесія недійсна" }, { status: 401 });

  const { data: slot } = await supabase
    .from("album_type_slots")
    .select("id, kind, max_photos, album_type_id")
    .eq("id", params.slotId)
    .maybeSingle();
  if (!slot || slot.kind !== "photo" || slot.album_type_id !== (student as any).classes?.album_type_id) {
    return NextResponse.json({ error: "Слот не знайдено" }, { status: 404 });
  }
  if (photoIds.length > slot.max_photos) {
    return NextResponse.json({ error: `Для цього слота можна обрати не більше ${slot.max_photos} фото` }, { status: 400 });
  }

  if (photoIds.length > 0) {
    const { data: ownFavorites } = await supabase.from("favorites").select("photo_id").eq("student_id", student.id);
    const favoriteIds = new Set((ownFavorites ?? []).map((f: any) => f.photo_id));
    if (!photoIds.every((id: string) => favoriteIds.has(id))) {
      return NextResponse.json({ error: "Можна обирати лише зі свого обраного" }, { status: 400 });
    }
  }

  await supabase.from("student_slot_photos").delete().eq("student_id", student.id).eq("slot_id", params.slotId);
  if (photoIds.length > 0) {
    const { error } = await supabase.from("student_slot_photos").insert(
      photoIds.map((photoId: string, i: number) => ({
        student_id: student.id,
        slot_id: params.slotId,
        photo_id: photoId,
        sort_order: i,
      }))
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await supabase.from("students").update({ selection_confirmed_at: null }).eq("id", student.id);

  return NextResponse.json({ ok: true });
}
