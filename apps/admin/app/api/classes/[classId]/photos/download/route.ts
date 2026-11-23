import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { fetchAllRows } from "@otak/supabase/paginate";
import { loadPhotoCategories } from "@otak/supabase/photo-categories";
import { requireAdmin } from "@/lib/require-admin";

/** Без символів, заборонених в іменах файлів/папок Windows і macOS. */
function safe(name: string) {
  return name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "без назви";
}

/**
 * GET /api/classes/[classId]/photos/download?kind=all|jpeg|raw&category=all|<key>
 *
 * Список файлів для ZIP-архіву галереї класу: { files: [{ path, url }], className }.
 * Архів пакує БРАУЗЕР (classes/[classId]/photos/zip-download.tsx), тягнучи
 * файли напряму зі Storage за підписаними посиланнями. Раніше архів
 * стрімився через функцію Vercel — гігабайти RAW з'їдали ліміт Fast Origin
 * Transfer безкоштовного тарифу.
 */
export async function GET(req: Request, { params }: { params: { classId: string } }) {
  const user = await requireAdmin("classes");
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const kind = (searchParams.get("kind") ?? "all") as "all" | "jpeg" | "raw";
  const category = searchParams.get("category") ?? "all";

  const service = createSupabaseServiceRoleClient();
  const [{ data: klass }, categories] = await Promise.all([
    service.from("classes").select("name").eq("id", params.classId).maybeSingle(),
    loadPhotoCategories(service),
  ]);
  const labels = new Map(categories.map((c) => [c.key, safe(c.label)]));

  const photos = await fetchAllRows<{ filename: string; storage_path: string; category: string }>((from, to) => {
    let q = service.from("photos").select("filename, storage_path, category").eq("class_id", params.classId);
    if (kind !== "all") q = q.eq("file_kind", kind);
    if (category !== "all") q = q.eq("category", category);
    return q.order("uploaded_at").order("id").range(from, to);
  });
  if (!photos.length) return NextResponse.json({ error: "Немає фото за обраними фільтрами" }, { status: 404 });

  // Підписуємо пачками (ліміт Storage — 1000 шляхів на запит); посилання на 3 год — великі архіви качаються довго.
  const urlByPath = new Map<string, string>();
  const paths = [...new Set(photos.map((p) => p.storage_path))];
  for (let i = 0; i < paths.length; i += 500) {
    const { data } = await service.storage.from("photos").createSignedUrls(paths.slice(i, i + 500), 60 * 60 * 3);
    for (const s of data ?? []) if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
  }

  // Унікальні імена в архіві: «Категорія/R6__0740.JPG», дублікати — «R6__0740-2.JPG».
  const used = new Set<string>();
  const files: { path: string; url: string }[] = [];
  for (const p of photos) {
    const url = urlByPath.get(p.storage_path);
    if (!url) continue;
    const dir = labels.get(p.category) ?? p.category;
    let name = `${dir}/${p.filename}`;
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${dir}/${p.filename.replace(/(\.[^.]+)?$/, `-${i}$1`)}`;
    used.add(name.toLowerCase());
    files.push({ path: name, url });
  }

  return NextResponse.json({ files, className: safe(klass?.name ?? "Клас") });
}
