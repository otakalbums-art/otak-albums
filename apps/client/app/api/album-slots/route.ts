import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServiceRoleClient } from "@otak/supabase";

/**
 * GET /api/album-slots — фото-слоти (kind='photo') типу альбому класу
 * учня + поточні призначення учня в student_slot_photos + його favorites
 * (кандидат-пул для вибору) + чи підтвердив відбір.
 *
 * Авторизація: otak_session cookie -> students.session_token, той самий
 * підхід, що й apps/client/app/api/photos/route.ts.
 */
export async function GET() {
  const sessionToken = cookies().get("otak_session")?.value;
  if (!sessionToken) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });

  const supabase = createSupabaseServiceRoleClient();
  const { data: student } = await supabase
    .from("students")
    .select("id, class_id, selection_confirmed_at, classes(album_type_id)")
    .eq("session_token", sessionToken)
    .single();

  if (!student) return NextResponse.json({ error: "Сесія недійсна" }, { status: 401 });

  const albumTypeId = (student as any).classes?.album_type_id;
  if (!albumTypeId) {
    return NextResponse.json({ slots: [], assignments: {}, favorites: [], confirmedAt: null });
  }

  const { data: slots } = await supabase
    .from("album_type_slots")
    .select("id, label, max_photos, sort_order")
    .eq("album_type_id", albumTypeId)
    .eq("kind", "photo")
    .order("sort_order");

  const slotIds = (slots ?? []).map((s: any) => s.id);

  const [{ data: assignedRows }, { data: favoriteRows }] = await Promise.all([
    slotIds.length
      ? supabase
          .from("student_slot_photos")
          .select("slot_id, photos(id, filename, storage_path)")
          .eq("student_id", student.id)
          .in("slot_id", slotIds)
      : Promise.resolve({ data: [] as any[] }),
    supabase
      .from("favorites")
      .select("photos(id, filename, storage_path)")
      .eq("student_id", student.id),
  ]);

  // Signed URLs одним батчем для всіх задіяних фото (призначені + обрані).
  const paths = new Set<string>();
  for (const r of assignedRows ?? []) if ((r as any).photos?.storage_path) paths.add((r as any).photos.storage_path);
  for (const r of favoriteRows ?? []) if ((r as any).photos?.storage_path) paths.add((r as any).photos.storage_path);
  const { data: signedUrls } = paths.size
    ? await supabase.storage.from("photos").createSignedUrls([...paths], 60 * 60)
    : { data: [] as any[] };
  const urlByPath = new Map<string, string>(
    (signedUrls ?? []).map((s: any) => [s.path, s.signedUrl] as [string, string])
  );

  const assignments: Record<string, { id: string; filename: string; url: string | null }[]> = {};
  (assignedRows ?? []).forEach((r: any) => {
    if (!r.photos) return;
    const list = assignments[r.slot_id] ?? [];
    const url: string | null = urlByPath.get(r.photos.storage_path) ?? null;
    list.push({ id: r.photos.id, filename: r.photos.filename, url });
    assignments[r.slot_id] = list;
  });

  const favorites = (favoriteRows ?? [])
    .filter((r: any) => r.photos)
    .map((r: any) => ({ id: r.photos.id, filename: r.photos.filename, url: urlByPath.get(r.photos.storage_path) ?? null }));

  return NextResponse.json({
    slots: slots ?? [],
    assignments,
    favorites,
    confirmedAt: student.selection_confirmed_at,
  });
}
