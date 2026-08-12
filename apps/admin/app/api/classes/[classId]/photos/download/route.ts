import { NextResponse } from "next/server";
import { Readable } from "stream";
import archiver from "archiver";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { requireAdmin } from "@/lib/require-admin";

const KIND_LABEL: Record<string, string> = { all: "усі", jpeg: "jpeg", raw: "raw" };

/**
 * GET /api/classes/[classId]/photos/download?kind=all|jpeg|raw&category=all|portrait|...
 *
 * Стрімить zip-архів напряму у відповідь, без збирання всього в пам'яті —
 * archiver дописує файли по одному в міру завантаження з Storage (RAW може
 * важити десятки МБ на кадр, тримати весь клас одразу в пам'яті не варто).
 * `category` — той самий фільтр, що вже обраний у галереї (apps/admin/app/classes/[classId]/photos/photos-gallery.tsx),
 * "all" = усі категорії.
 */
export async function GET(req: Request, { params }: { params: { classId: string } }) {
  const user = await requireAdmin("classes");
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const kind = (searchParams.get("kind") ?? "all") as "all" | "jpeg" | "raw";
  const category = searchParams.get("category") ?? "all";

  const service = createSupabaseServiceRoleClient();

  const { data: klass } = await service.from("classes").select("name").eq("id", params.classId).maybeSingle();

  let query = service
    .from("photos")
    .select("filename, storage_path, category, file_kind")
    .eq("class_id", params.classId);
  if (kind !== "all") query = query.eq("file_kind", kind);
  if (category !== "all") query = query.eq("category", category);

  const { data: photos } = await query;
  if (!photos || photos.length === 0) {
    return NextResponse.json({ error: "Немає фото за обраними фільтрами" }, { status: 404 });
  }

  const archive = archiver("zip", { zlib: { level: 0 } }); // фото й так стиснені — zip-компресія лише сповільнить
  archive.on("warning", (err) => console.warn("[photos/download] archiver warning:", err.message));
  archive.on("error", (err) => console.error("[photos/download] archiver error:", err.message));

  // Кладемо файли в архів послідовно (не всі паралельно) — так у пам'яті
  // одночасно лише один файл, а не весь клас.
  const usedNames = new Set<string>();
  (async () => {
    for (const p of photos) {
      const { data: blob, error } = await service.storage.from("photos").download(p.storage_path);
      if (error || !blob) {
        console.error(`[photos/download] не вдалось завантажити ${p.storage_path}:`, error?.message);
        continue;
      }
      let entryName = `${p.category}/${p.filename}`;
      let i = 2;
      while (usedNames.has(entryName)) {
        entryName = `${p.category}/${p.filename.replace(/(\.[^.]+)$/, `-${i}$1`)}`;
        i++;
      }
      usedNames.add(entryName);
      archive.append(Buffer.from(await blob.arrayBuffer()), { name: entryName });
    }
    archive.finalize();
  })();

  const className = klass?.name ?? "клас";
  const fileName = `${className}-${KIND_LABEL[kind] ?? kind}${category !== "all" ? `-${category}` : ""}.zip`;

  return new Response(Readable.toWeb(archive) as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      // Кирилиця у filename за RFC 5987 (filename*) + ASCII-фолбек для старих клієнтів.
      "Content-Disposition": `attachment; filename="photos-${kind}.zip"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
