import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { requireAdmin } from "@/lib/require-admin";
import { frameKey } from "@/lib/file-type";
import { rawTwinsForClass } from "@/lib/raw-twins";

type Format = "jpeg" | "raw" | "both";

/** Без символів, заборонених в іменах файлів/папок Windows і macOS. */
function safe(name: string) {
  return name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "без назви";
}

/**
 * POST /api/classes/[classId]/crm/download { format: "jpeg"|"raw"|"both" }
 * — список файлів, обраних у фото-слоти альбому (student_slot_photos), з
 * підписаними посиланнями й шляхами в архіві:
 *   "Прізвище Ім'я/Портрет — R6__0740.JPG"
 * RAW — це RAW-пара обраного JPEG (та сама назва кадру). Архів пакує
 * браузер: RAW по ~25 МБ через Vercel-функцію не проженеш.
 */
export async function POST(req: Request, { params }: { params: { classId: string } }) {
  const user = await requireAdmin("crm");
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const { format = "both" } = (await req.json().catch(() => ({}))) as { format?: Format };
  if (!["jpeg", "raw", "both"].includes(format)) return NextResponse.json({ error: "Невірний формат" }, { status: 400 });

  const service = createSupabaseServiceRoleClient();
  const { data: klass } = await service
    .from("classes")
    .select("id, name, album_type_id")
    .eq("id", params.classId)
    .maybeSingle();
  if (!klass) return NextResponse.json({ error: "Клас не знайдено" }, { status: 404 });
  if (!klass.album_type_id) return NextResponse.json({ error: "Для класу не обрано тип альбому" }, { status: 400 });

  const [{ data: slots }, { data: students }] = await Promise.all([
    service
      .from("album_type_slots")
      .select("id, label, sort_order")
      .eq("album_type_id", klass.album_type_id)
      .eq("kind", "photo")
      .order("sort_order"),
    service.from("students").select("id, first_name, last_name").eq("class_id", params.classId),
  ]);
  const slotIds = (slots ?? []).map((s) => s.id);
  const studentIds = (students ?? []).map((s) => s.id);
  if (!slotIds.length || !studentIds.length) return NextResponse.json({ files: [], missingRaw: [] });

  const [{ data: picks }, rawByKey] = await Promise.all([
    service
      .from("student_slot_photos")
      .select("student_id, slot_id, sort_order, photos(id, filename, storage_path)")
      .in("student_id", studentIds)
      .in("slot_id", slotIds)
      .order("sort_order"),
    format === "jpeg" ? Promise.resolve(new Map()) : rawTwinsForClass(service, params.classId),
  ]);

  const studentName = new Map((students ?? []).map((s) => [s.id, safe(`${s.last_name} ${s.first_name}`)]));
  const slotLabel = new Map((slots ?? []).map((s) => [s.id, safe(s.label)]));
  const slotOrder = new Map((slots ?? []).map((s, i) => [s.id, i]));

  const entries: { path: string; storage_path: string }[] = [];
  const missingRaw: string[] = [];
  const sorted = [...(picks ?? [])].sort(
    (a: any, b: any) =>
      (studentName.get(a.student_id) ?? "").localeCompare(studentName.get(b.student_id) ?? "", "uk") ||
      (slotOrder.get(a.slot_id) ?? 0) - (slotOrder.get(b.slot_id) ?? 0) ||
      a.sort_order - b.sort_order
  );
  for (const p of sorted as any[]) {
    const photo = p.photos;
    if (!photo) continue;
    const dir = studentName.get(p.student_id);
    const label = slotLabel.get(p.slot_id);
    if (!dir || !label) continue;
    if (format !== "raw") entries.push({ path: `${dir}/${label} — ${photo.filename}`, storage_path: photo.storage_path });
    if (format !== "jpeg") {
      const raw = rawByKey.get(frameKey(photo.filename));
      if (raw) entries.push({ path: `${dir}/${label} — ${raw.filename}`, storage_path: raw.storage_path });
      else missingRaw.push(`${dir}: ${photo.filename}`);
    }
  }

  // Підписуємо пачками (у Supabase ліміт 1000 шляхів на запит).
  const urlByPath = new Map<string, string>();
  const unique = [...new Set(entries.map((e) => e.storage_path))];
  for (let i = 0; i < unique.length; i += 500) {
    const { data } = await service.storage.from("photos").createSignedUrls(unique.slice(i, i + 500), 60 * 60 * 3);
    for (const s of data ?? []) if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
  }

  const files = entries
    .map((e) => ({ path: e.path, url: urlByPath.get(e.storage_path) }))
    .filter((f): f is { path: string; url: string } => !!f.url);

  return NextResponse.json({ files, missingRaw, className: safe(klass.name) });
}
