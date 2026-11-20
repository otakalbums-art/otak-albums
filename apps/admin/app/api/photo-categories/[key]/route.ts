import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { requireAdmin } from "@/lib/require-admin";

/**
 * PATCH  /api/photo-categories/[key] { label?, hiddenFromParents?, autoFaces?: "single"|"multi"|null }
 *        autoFaces — автосортування за обличчями; правило може мати лише одна категорія.
 * DELETE /api/photo-categories/[key] — фото цієї категорії переходять у
 *        «Без категорії» (самі файли не чіпаємо); службові не видаляються.
 */
export async function PATCH(req: Request, { params }: { params: { key: string } }) {
  const user = await requireAdmin("classes");
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const update: { label?: string; hidden_from_parents?: boolean; auto_faces?: "single" | "multi" | null } = {};
  if (body.label !== undefined) {
    const label = String(body.label).trim();
    if (!label || label.length > 60) return NextResponse.json({ error: "Вкажіть назву (до 60 символів)" }, { status: 400 });
    update.label = label;
  }
  if (body.hiddenFromParents !== undefined) update.hidden_from_parents = !!body.hiddenFromParents;

  const service = createSupabaseServiceRoleClient();
  if (body.autoFaces !== undefined) {
    const rule = body.autoFaces === "single" || body.autoFaces === "multi" ? body.autoFaces : null;
    if (params.key === "personal" && rule) {
      return NextResponse.json({ error: "Персональні фото не сортуються автоматично" }, { status: 400 });
    }
    // Правило переходить до цієї категорії — з попередньої знімаємо.
    if (rule) await service.from("photo_categories").update({ auto_faces: null }).eq("auto_faces", rule).neq("key", params.key);
    update.auto_faces = rule;
  }
  const { error } = await service.from("photo_categories").update(update).eq("key", params.key);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { key: string } }) {
  const user = await requireAdmin("classes");
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });
  const service = createSupabaseServiceRoleClient();

  const { data: cat } = await service.from("photo_categories").select("key, is_system").eq("key", params.key).maybeSingle();
  if (!cat) return NextResponse.json({ error: "Категорію не знайдено" }, { status: 404 });
  if (cat.is_system) return NextResponse.json({ error: "Службову категорію не можна видалити" }, { status: 400 });

  const { error: moveError, count } = await service
    .from("photos")
    .update({ category: "uncategorized" }, { count: "exact" })
    .eq("category", params.key);
  if (moveError) return NextResponse.json({ error: moveError.message }, { status: 400 });

  const { error } = await service.from("photo_categories").delete().eq("key", params.key);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, moved: count ?? 0 });
}
