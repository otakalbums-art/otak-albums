import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { fetchAllRows } from "@otak/supabase/paginate";
import { faceSortRules, loadPhotoCategories } from "@otak/supabase/photo-categories";
import { autoSortTarget } from "@otak/supabase/faces";
import { requireAdmin } from "@/lib/require-admin";
import { frameKey } from "@/lib/file-type";

type Row = { id: string; filename: string; category: string; file_kind: string; face_count: number | null; faces_analyzed_at: string | null };

async function classPhotos(service: ReturnType<typeof createSupabaseServiceRoleClient>, classId: string) {
  return fetchAllRows<Row>((from, to) =>
    service
      .from("photos")
      .select("id, filename, category, file_kind, face_count, faces_analyzed_at")
      .eq("class_id", classId)
      .order("id")
      .range(from, to)
  );
}

/**
 * GET  /api/classes/[classId]/faces — стан аналізу облич: { total, analyzed } (JPEG).
 * POST /api/classes/[classId]/faces — розсортувати за обличчями всі вже
 *      проаналізовані JPEG класу за правилами категорій (+ їхні RAW-пари).
 *      Аналіз робить сервер камер (scripts/face-worker.py) сам; ця кнопка —
 *      щоб пересортувати після ручного дозавантаження чи зміни правил.
 */
export async function GET(_req: Request, { params }: { params: { classId: string } }) {
  const user = await requireAdmin(["classes", "crm"]);
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });
  const service = createSupabaseServiceRoleClient();
  const photos = (await classPhotos(service, params.classId)).filter((p) => p.file_kind === "jpeg");
  return NextResponse.json({ total: photos.length, analyzed: photos.filter((p) => p.faces_analyzed_at).length });
}

export async function POST(_req: Request, { params }: { params: { classId: string } }) {
  const user = await requireAdmin("classes");
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });
  const service = createSupabaseServiceRoleClient();

  const rules = faceSortRules(await loadPhotoCategories(service));
  if (!rules.single && !rules.multi) {
    return NextResponse.json(
      { error: "Жодна категорія не має правила автосортування — задайте його на сторінці «Категорії фото»" },
      { status: 400 }
    );
  }

  const all = await classPhotos(service, params.classId);
  const rawsByKey = new Map<string, Row[]>();
  for (const p of all) {
    if (p.file_kind !== "raw") continue;
    const list = rawsByKey.get(frameKey(p.filename)) ?? [];
    list.push(p);
    rawsByKey.set(frameKey(p.filename), list);
  }

  // Групуємо переміщення за цільовою категорією — менше запитів.
  const moves = new Map<string, string[]>();
  let jpegMoved = 0;
  const jpegs = all.filter((p) => p.file_kind === "jpeg");
  for (const p of jpegs) {
    if (!p.faces_analyzed_at || p.face_count === null) continue;
    const target = autoSortTarget(p.category, p.face_count, rules);
    if (!target) continue;
    jpegMoved++;
    const ids = moves.get(target) ?? [];
    ids.push(p.id, ...(rawsByKey.get(frameKey(p.filename)) ?? []).map((r) => r.id));
    moves.set(target, ids);
  }
  for (const [target, ids] of moves) {
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await service.from("photos").update({ category: target }).in("id", ids.slice(i, i + 200));
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  return NextResponse.json({
    moved: jpegMoved,
    analyzed: jpegs.filter((p) => p.faces_analyzed_at).length,
    total: jpegs.length,
  });
}
