import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { requireAdmin } from "@/lib/require-admin";

/**
 * PUT /api/students/[studentId]/slots/[slotId]/photos
 * Body: { photoIds: string[] } — повністю замінює набір фото цього слоту
 * для учня (delete + insert, без транзакції — так само, як інші прості
 * write-роути в адмінці).
 */
export async function PUT(req: Request, { params }: { params: { studentId: string; slotId: string } }) {
  const user = await requireAdmin("crm");
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const { photoIds } = await req.json();
  if (!Array.isArray(photoIds)) return NextResponse.json({ error: "photoIds має бути масивом" }, { status: 400 });

  const service = createSupabaseServiceRoleClient();

  // Слот має бути kind='photo' і належати типу альбому класу цього учня —
  // інакше можна було б випадково прив'язати фото-слот іншого типу альбому.
  const { data: student } = await service
    .from("students")
    .select("id, classes(album_type_id)")
    .eq("id", params.studentId)
    .maybeSingle();
  if (!student) return NextResponse.json({ error: "Учня не знайдено" }, { status: 404 });

  const { data: slot } = await service
    .from("album_type_slots")
    .select("id, kind, album_type_id")
    .eq("id", params.slotId)
    .maybeSingle();
  if (!slot || slot.kind !== "photo") return NextResponse.json({ error: "Це не фото-слот" }, { status: 400 });
  if (slot.album_type_id !== (student as any).classes?.album_type_id) {
    return NextResponse.json({ error: "Слот не належить типу альбому цього класу" }, { status: 400 });
  }

  await service.from("student_slot_photos").delete().eq("student_id", params.studentId).eq("slot_id", params.slotId);

  if (photoIds.length > 0) {
    const { error } = await service.from("student_slot_photos").insert(
      photoIds.map((photoId: string, i: number) => ({
        student_id: params.studentId,
        slot_id: params.slotId,
        photo_id: photoId,
        sort_order: i,
      }))
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Адмін втрутився в слот — раніше підтверджений учнем відбір міг більше
  // не відповідати тому, що учень бачив на екрані, коли тиснув "Підтвердити".
  await service.from("students").update({ selection_confirmed_at: null }).eq("id", params.studentId);

  return NextResponse.json({ ok: true });
}
