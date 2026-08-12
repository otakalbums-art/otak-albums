import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { requireAdmin } from "@/lib/require-admin";
import { slotKeySlug } from "@/lib/slugify";

// Групи фото-слотів, які можна згенерувати одразу при створенні типу
// альбому — назва підпису формується як "{label} {N}".
const SLOT_GROUPS: { field: string; label: string }[] = [
  { field: "portraitCount", label: "Портрет" },
  { field: "studioCount", label: "Фото студія" },
  { field: "schoolCount", label: "Шкільне фото" },
  { field: "outsideSchoolCount", label: "Фото поза школою" },
];

/**
 * POST /api/album-types — створити тип альбому.
 * Body: { name, pageCount?, price?, costPrice?,
 *         portraitCount?, studioCount?, schoolCount?, outsideSchoolCount? }
 *
 * Кількості одразу генерують відповідні album_type_slots ("Портрет 1",
 * "Портрет 2", ... "Фото студія 1", ...) — далі їх можна донастроїти
 * (перейменувати/видалити/додати ще) на /album-types/[id]/slots.
 */
export async function POST(req: Request) {
  const user = await requireAdmin("album_types");
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const body = await req.json();
  const { name, pageCount, price, costPrice } = body;
  if (!name?.trim()) return NextResponse.json({ error: "Вкажіть назву типу альбому" }, { status: 400 });

  const service = createSupabaseServiceRoleClient();
  const { data: albumType, error } = await service
    .from("album_types")
    .insert({
      name: name.trim(),
      page_count: pageCount ? Number(pageCount) : null,
      price: price ? Number(price) : null,
      cost_price: costPrice ? Number(costPrice) : null,
      folder_template: [],
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const slotsToInsert: Record<string, unknown>[] = [];
  let sortOrder = 0;
  for (const group of SLOT_GROUPS) {
    const count = Math.max(0, Number(body[group.field]) || 0);
    for (let i = 1; i <= count; i++) {
      const label = `${group.label} ${i}`;
      slotsToInsert.push({
        album_type_id: albumType.id,
        key: slotKeySlug(label),
        label,
        kind: "photo",
        max_photos: 1,
        filled_by: "admin",
        sort_order: sortOrder++,
      });
    }
  }

  // Кастомні групи (довільна назва, задана адміном) — той самий патерн
  // "{назва} {N}", просто джерело назви не фіксоване, а з форми.
  const customGroups: { label?: string; count?: number }[] = Array.isArray(body.customGroups) ? body.customGroups : [];
  for (const group of customGroups) {
    const label = group.label?.trim();
    const count = Math.max(0, Number(group.count) || 0);
    if (!label || count === 0) continue;
    for (let i = 1; i <= count; i++) {
      const slotLabel = `${label} ${i}`;
      slotsToInsert.push({
        album_type_id: albumType.id,
        key: slotKeySlug(slotLabel),
        label: slotLabel,
        kind: "photo",
        max_photos: 1,
        filled_by: "admin",
        sort_order: sortOrder++,
      });
    }
  }

  if (slotsToInsert.length > 0) {
    const { error: slotsError } = await service.from("album_type_slots").insert(slotsToInsert);
    // Тип альбому вже створений — навіть якщо слоти не вставились, не
    // відкочуємо, просто повідомляємо (адмін завжди може додати слоти
    // вручну на /album-types/[id]/slots).
    if (slotsError) {
      return NextResponse.json({ albumType, warning: `Тип створено, але слоти не вдалось згенерувати: ${slotsError.message}` });
    }
  }

  return NextResponse.json({ albumType });
}
