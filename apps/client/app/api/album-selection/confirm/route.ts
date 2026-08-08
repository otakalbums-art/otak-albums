import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServiceRoleClient } from "@otak/supabase";

/**
 * POST /api/album-selection/confirm
 *
 * Схема БД не має окремого прапорця "відбір підтверджено" (album_selections —
 * це вже фінальний список, кожен POST /select одразу зберігається). Тому
 * "підтвердження" тут — це валідація (є хоч одне обране фото) і повернення
 * фінального списку для підсумкового екрану, а не запис додаткового стану.
 * Якщо згодом знадобиться "заморозити" відбір від подальших змін — це вимагатиме
 * нової колонки (напр. students.album_selection_locked_at) окремою міграцією.
 */
export async function POST() {
  const sessionToken = cookies().get("otak_session")?.value;
  if (!sessionToken) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });

  const supabase = createSupabaseServiceRoleClient();
  const { data: student } = await supabase
    .from("students")
    .select("id")
    .eq("session_token", sessionToken)
    .single();

  if (!student) return NextResponse.json({ error: "Сесія недійсна" }, { status: 401 });

  const { data: selections } = await supabase
    .from("album_selections")
    .select("photo_id, photos(filename)")
    .eq("student_id", student.id);

  if (!selections || selections.length === 0) {
    return NextResponse.json({ error: "Оберіть принаймні одне фото для альбому" }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    selectedCount: selections.length,
    photos: selections.map((s: any) => ({ id: s.photo_id, filename: s.photos?.filename })),
  });
}
