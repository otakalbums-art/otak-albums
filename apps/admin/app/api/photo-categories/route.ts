import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { loadPhotoCategories } from "@otak/supabase/photo-categories";
import { requireAdmin } from "@/lib/require-admin";
import { slotKeySlug } from "@/lib/slugify";

/**
 * Категорії фото (supabase/migrations/0018_photo_categories.sql).
 * GET  — список у порядку показу + скільки фото в кожній
 * POST — нова категорія { label }; key (папка на FTP) генерується з назви
 * PUT  — новий порядок { keys: string[] }
 */
export async function GET() {
  const user = await requireAdmin(["classes", "ftp", "crm"]);
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });
  const service = createSupabaseServiceRoleClient();
  const categories = await loadPhotoCategories(service);
  const counts = await Promise.all(
    categories.map((c) =>
      service.from("photos").select("id", { count: "exact", head: true }).eq("category", c.key).then((r) => r.count ?? 0)
    )
  );
  return NextResponse.json({ categories: categories.map((c, i) => ({ ...c, photoCount: counts[i] })) });
}

export async function POST(req: Request) {
  const user = await requireAdmin("classes");
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });
  const { label } = await req.json().catch(() => ({}));
  const name = String(label ?? "").trim();
  if (!name || name.length > 60) return NextResponse.json({ error: "Вкажіть назву (до 60 символів)" }, { status: 400 });

  const service = createSupabaseServiceRoleClient();
  const existing = await loadPhotoCategories(service);
  const used = new Set(existing.map((c) => c.key));
  const base = slotKeySlug(name).slice(0, 36).replace(/^[^a-z0-9]+/, "") || "category";
  let key = base;
  for (let i = 2; used.has(key); i++) key = `${base}-${i}`;

  const sortOrder = Math.max(0, ...existing.map((c) => c.sort_order)) + 1;
  const { error } = await service.from("photo_categories").insert({ key, label: name, sort_order: sortOrder });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, key });
}

export async function PUT(req: Request) {
  const user = await requireAdmin("classes");
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });
  const { keys } = await req.json().catch(() => ({}));
  if (!Array.isArray(keys)) return NextResponse.json({ error: "Невірний запит" }, { status: 400 });
  const service = createSupabaseServiceRoleClient();
  for (const [i, key] of keys.entries()) {
    await service.from("photo_categories").update({ sort_order: i + 1 }).eq("key", String(key));
  }
  return NextResponse.json({ ok: true });
}
