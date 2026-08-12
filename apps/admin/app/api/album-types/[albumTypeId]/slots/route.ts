import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { requireAdmin } from "@/lib/require-admin";
import { slotKeySlug } from "@/lib/slugify";

const KINDS = ["photo", "text"] as const;
const FILLED_BY = ["admin", "student"] as const;

/**
 * GET  /api/album-types/[albumTypeId]/slots — список слотів типу альбому.
 * POST /api/album-types/[albumTypeId]/slots  — створити новий слот.
 * Body: { label, kind: 'photo'|'text', maxPhotos?, filledBy?: 'admin'|'student' }
 *
 * `key` (стабільний машинний ключ) генерується сервером з `label`
 * (apps/admin/lib/slugify.ts) — адмін його не бачить і не вводить.
 */
export async function GET(_req: Request, { params }: { params: { albumTypeId: string } }) {
  const user = await requireAdmin("album_types");
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const service = createSupabaseServiceRoleClient();
  const { data: slots, error } = await service
    .from("album_type_slots")
    .select("*")
    .eq("album_type_id", params.albumTypeId)
    .order("sort_order");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ slots: slots ?? [] });
}

export async function POST(req: Request, { params }: { params: { albumTypeId: string } }) {
  const user = await requireAdmin("album_types");
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const { label, kind, maxPhotos, filledBy } = await req.json();
  if (!label?.trim()) return NextResponse.json({ error: "Вкажіть підпис слоту" }, { status: 400 });
  if (!KINDS.includes(kind)) return NextResponse.json({ error: "Невірний тип слоту" }, { status: 400 });

  const resolvedFilledBy = filledBy && FILLED_BY.includes(filledBy) ? filledBy : "admin";
  if (kind === "photo" && resolvedFilledBy !== "admin") {
    return NextResponse.json({ error: "Фото-слоти завжди заповнює адмін" }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();

  // Ключ має бути унікальним у межах типу альбому — базовий слаг з label,
  // за колізії додаємо -2/-3/...
  const baseKey = slotKeySlug(label);
  const { data: existing } = await service
    .from("album_type_slots")
    .select("key, sort_order")
    .eq("album_type_id", params.albumTypeId);

  const existingKeys = new Set((existing ?? []).map((s: any) => s.key));
  let key = baseKey;
  let suffix = 2;
  while (existingKeys.has(key)) {
    key = `${baseKey}-${suffix}`;
    suffix++;
  }

  const nextSortOrder = (existing ?? []).reduce((max: number, s: any) => Math.max(max, s.sort_order), -1) + 1;

  const { data: slot, error } = await service
    .from("album_type_slots")
    .insert({
      album_type_id: params.albumTypeId,
      key,
      label: label.trim(),
      kind,
      max_photos: kind === "photo" ? Math.max(1, Number(maxPhotos) || 1) : 1,
      filled_by: resolvedFilledBy,
      sort_order: nextSortOrder,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ slot });
}
