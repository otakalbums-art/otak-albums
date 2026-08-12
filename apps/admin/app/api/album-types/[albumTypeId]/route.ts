import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { requireAdmin } from "@/lib/require-admin";

/**
 * PATCH /api/album-types/[albumTypeId] — редагувати базові поля типу
 * альбому (name/pageCount/price/costPrice). Слоти й далі керуються
 * окремо на /album-types/[id]/slots.
 */
export async function PATCH(req: Request, { params }: { params: { albumTypeId: string } }) {
  const user = await requireAdmin("album_types");
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const { name, pageCount, price, costPrice } = await req.json();
  const update: Record<string, unknown> = {};
  if (name !== undefined) {
    if (!name.trim()) return NextResponse.json({ error: "Вкажіть назву типу альбому" }, { status: 400 });
    update.name = name.trim();
  }
  if (pageCount !== undefined) update.page_count = pageCount ? Number(pageCount) : null;
  if (price !== undefined) update.price = price ? Number(price) : null;
  if (costPrice !== undefined) update.cost_price = costPrice ? Number(costPrice) : null;

  const service = createSupabaseServiceRoleClient();
  const { data: albumType, error } = await service
    .from("album_types")
    .update(update)
    .eq("id", params.albumTypeId)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ albumType });
}

/**
 * DELETE /api/album-types/[albumTypeId] — видалити тип альбому.
 * Заблоковано (400), поки до нього прив'язаний хоч один клас — так само
 * перевіряється й в UI (кнопка неактивна), тут — захист на бекенді.
 */
export async function DELETE(_req: Request, { params }: { params: { albumTypeId: string } }) {
  const user = await requireAdmin("album_types");
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const service = createSupabaseServiceRoleClient();

  const { count } = await service
    .from("classes")
    .select("id", { count: "exact", head: true })
    .eq("album_type_id", params.albumTypeId);

  if (count && count > 0) {
    return NextResponse.json(
      { error: `Не можна видалити — використовується в ${count} ${count === 1 ? "класі" : "класах"}` },
      { status: 400 }
    );
  }

  const { error } = await service.from("album_types").delete().eq("id", params.albumTypeId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
