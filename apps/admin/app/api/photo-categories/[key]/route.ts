import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { requireAdmin } from "@/lib/require-admin";
import { fetchAllRows } from "@otak/supabase/paginate";
import { frameKey } from "@/lib/file-type";

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
  let moved = 0;
  if (body.autoFaces !== undefined) {
    const rule = body.autoFaces === "single" || body.autoFaces === "multi" ? body.autoFaces : null;
    if (params.key === "personal" && rule) {
      return NextResponse.json({ error: "Персональні фото не сортуються автоматично" }, { status: 400 });
    }
    // Правило переходить до цієї категорії — з попередньої знімаємо, а вже
    // розсортовані туди фото переїжджають слідом (разом із RAW-парами).
    if (rule) {
      const { data: prev } = await service
        .from("photo_categories")
        .select("key")
        .eq("auto_faces", rule)
        .neq("key", params.key)
        .maybeSingle();
      await service.from("photo_categories").update({ auto_faces: null }).eq("auto_faces", rule).neq("key", params.key);
      if (prev) moved = await moveSortedPhotos(service, prev.key, params.key, rule);
    }
    update.auto_faces = rule;
  }
  const { error } = await service.from("photo_categories").update(update).eq("key", params.key);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, moved });
}

/**
 * Фото, які автосортування поклало в from (JPEG із 1 / 2+ обличчями й
 * faces_sorted_at), + їхні RAW-пари з тієї ж категорії — у to.
 */
async function moveSortedPhotos(
  service: ReturnType<typeof createSupabaseServiceRoleClient>,
  from: string,
  to: string,
  rule: "single" | "multi"
) {
  type Row = { id: string; class_id: string; filename: string; file_kind: string; face_count: number | null; faces_sorted_at: string | null };
  const rows = await fetchAllRows<Row>((a, b) =>
    service
      .from("photos")
      .select("id, class_id, filename, file_kind, face_count, faces_sorted_at")
      .eq("category", from)
      .order("id")
      .range(a, b)
  );
  const fits = (n: number | null) => n !== null && (rule === "single" ? n === 1 : n >= 2);
  const jpegs = rows.filter((r) => r.file_kind === "jpeg" && r.faces_sorted_at && fits(r.face_count));
  const keys = new Set(jpegs.map((r) => `${r.class_id}|${frameKey(r.filename)}`));
  const ids = [
    ...jpegs.map((r) => r.id),
    ...rows.filter((r) => r.file_kind === "raw" && keys.has(`${r.class_id}|${frameKey(r.filename)}`)).map((r) => r.id),
  ];
  for (let i = 0; i < ids.length; i += 200) {
    await service.from("photos").update({ category: to }).in("id", ids.slice(i, i + 200));
  }
  return jpegs.length;
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
