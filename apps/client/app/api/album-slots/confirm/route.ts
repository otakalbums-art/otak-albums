import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServiceRoleClient } from "@otak/supabase";

/**
 * POST /api/album-slots/confirm — підтвердити відбір. Сервер сам
 * перевіряє, що кожен фото-слот типу альбому класу учня заповнений
 * (є хоч 1 фото) — не довіряємо лише клієнтській перевірці.
 */
export async function POST() {
  const sessionToken = cookies().get("otak_session")?.value;
  if (!sessionToken) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });

  const supabase = createSupabaseServiceRoleClient();
  const { data: student } = await supabase
    .from("students")
    .select("id, classes(album_type_id)")
    .eq("session_token", sessionToken)
    .single();
  if (!student) return NextResponse.json({ error: "Сесія недійсна" }, { status: 401 });

  const albumTypeId = (student as any).classes?.album_type_id;
  if (!albumTypeId) return NextResponse.json({ error: "Для класу не обрано тип альбому" }, { status: 400 });

  const { data: slots } = await supabase
    .from("album_type_slots")
    .select("id, label")
    .eq("album_type_id", albumTypeId)
    .eq("kind", "photo");

  const slotIds = (slots ?? []).map((s: any) => s.id);
  const { data: filled } = slotIds.length
    ? await supabase.from("student_slot_photos").select("slot_id").eq("student_id", student.id).in("slot_id", slotIds)
    : { data: [] as any[] };

  const filledSlotIds = new Set((filled ?? []).map((f: any) => f.slot_id));
  const missing = (slots ?? []).filter((s: any) => !filledSlotIds.has(s.id));

  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Заповніть усі слоти перед підтвердженням: ${missing.map((s: any) => s.label).join(", ")}` },
      { status: 400 }
    );
  }

  await supabase.from("students").update({ selection_confirmed_at: new Date().toISOString() }).eq("id", student.id);
  return NextResponse.json({ ok: true });
}
