import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { requireAdmin } from "@/lib/require-admin";

/**
 * GET /api/students/[studentId]/photo-picks — два додаткові джерела фото
 * для пікера в CRM (apps/admin/.../crm/photo-picker.tsx), на додачу до
 * "Усі фото класу" (уже наявний /api/classes/[classId]/photos):
 *   - favorites — те, що учень сам позначив зіркою в галереї
 *   - selected  — унікальні фото, вже присутні в БУДЬ-ЯКОМУ з його слотів
 *     (student_slot_photos) — власний "остаточний" відбір (чи то учня
 *     через /album, чи то попередній вибір самого адміна).
 */
export async function GET(_req: Request, { params }: { params: { studentId: string } }) {
  const user = await requireAdmin("crm");
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const service = createSupabaseServiceRoleClient();

  const [{ data: favoriteRows }, { data: slotPhotoRows }] = await Promise.all([
    service.from("favorites").select("photos(id, filename, storage_path)").eq("student_id", params.studentId),
    service.from("student_slot_photos").select("photos(id, filename, storage_path)").eq("student_id", params.studentId),
  ]);

  const paths = new Set<string>();
  for (const r of favoriteRows ?? []) if ((r as any).photos?.storage_path) paths.add((r as any).photos.storage_path);
  for (const r of slotPhotoRows ?? []) if ((r as any).photos?.storage_path) paths.add((r as any).photos.storage_path);
  const { data: signedUrls } = paths.size
    ? await service.storage.from("photos").createSignedUrls([...paths], 60 * 60)
    : { data: [] as any[] };
  const urlByPath = new Map((signedUrls ?? []).map((s: any) => [s.path, s.signedUrl]));

  const favorites = (favoriteRows ?? [])
    .filter((r: any) => r.photos)
    .map((r: any) => ({ id: r.photos.id, filename: r.photos.filename, url: urlByPath.get(r.photos.storage_path) ?? null }));

  const seen = new Set<string>();
  const selected: typeof favorites = [];
  for (const r of slotPhotoRows ?? []) {
    const p = (r as any).photos;
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    selected.push({ id: p.id, filename: p.filename, url: urlByPath.get(p.storage_path) ?? null });
  }

  return NextResponse.json({ favorites, selected });
}
