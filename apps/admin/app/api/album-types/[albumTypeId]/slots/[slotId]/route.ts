import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { requireAdmin } from "@/lib/require-admin";

/**
 * PATCH /api/album-types/[albumTypeId]/slots/[slotId] — редагувати слот
 * (лише label / max_photos / filled_by / sort_order — kind і key незмінні
 * після створення, щоб не осиротити вже проставлені значення).
 * DELETE — видалити слот (каскадно видаляє student_slot_photos/answers).
 */
export async function PATCH(req: Request, { params }: { params: { albumTypeId: string; slotId: string } }) {
  const user = await requireAdmin("album_types");
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const { label, maxPhotos, filledBy, sortOrder } = await req.json();
  const update: Record<string, unknown> = {};
  if (label !== undefined) {
    if (!label.trim()) return NextResponse.json({ error: "Вкажіть підпис слоту" }, { status: 400 });
    update.label = label.trim();
  }
  if (maxPhotos !== undefined) update.max_photos = Math.max(1, Number(maxPhotos) || 1);
  if (filledBy !== undefined) update.filled_by = filledBy;
  if (sortOrder !== undefined) update.sort_order = sortOrder;

  const service = createSupabaseServiceRoleClient();
  const { data: slot, error } = await service
    .from("album_type_slots")
    .update(update)
    .eq("id", params.slotId)
    .eq("album_type_id", params.albumTypeId)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ slot });
}

export async function DELETE(_req: Request, { params }: { params: { albumTypeId: string; slotId: string } }) {
  const user = await requireAdmin("album_types");
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const service = createSupabaseServiceRoleClient();
  const { error } = await service
    .from("album_type_slots")
    .delete()
    .eq("id", params.slotId)
    .eq("album_type_id", params.albumTypeId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
