import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { requireOwner } from "@/lib/require-admin";
import { TAB_KEYS } from "@/lib/admin-tabs";

/**
 * PATCH /api/admin-roles/[id] — перейменувати роль / змінити набір вкладок.
 * is_owner і власницьку роль "Власник" не можна редагувати цим шляхом
 * (перевіряється тут же — роль-власника не можна перетворити на звичайну
 * чи навпаки через API, лише сидом у міграції 0009).
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireOwner();
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const supabase = createSupabaseServiceRoleClient();

  const { data: existing } = await supabase.from("admin_roles").select("is_owner").eq("id", params.id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Роль не знайдено" }, { status: 404 });
  if (existing.is_owner) return NextResponse.json({ error: "Роль власника не можна редагувати" }, { status: 400 });

  const { name, tabKeys } = await req.json();
  const update: Record<string, unknown> = {};
  if (name !== undefined) {
    if (!name.trim()) return NextResponse.json({ error: "Вкажіть назву ролі" }, { status: 400 });
    update.name = name.trim();
  }
  if (tabKeys !== undefined) {
    const keys: string[] = Array.isArray(tabKeys) ? tabKeys : [];
    const invalid = keys.filter((k) => !TAB_KEYS.includes(k as any));
    if (invalid.length > 0) {
      return NextResponse.json({ error: `Невідомі вкладки: ${invalid.join(", ")}` }, { status: 400 });
    }
    update.tab_keys = keys;
  }

  const { data: role, error } = await supabase
    .from("admin_roles")
    .update(update as never)
    .eq("id", params.id)
    .select("*")
    .single();

  if (error) {
    const message = error.code === "23505" ? "Роль з такою назвою вже є" : error.message;
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ role });
}

/**
 * DELETE /api/admin-roles/[id] — видалити роль. Заблоковано, якщо це роль
 * власника, або якщо на неї ще посилається хоч один admin_users (той
 * самий патерн, що й видалення типу альбому, поки є прив'язані класи).
 * FK admin_users.role_id ... on delete restrict — друга лінія захисту
 * на рівні БД, якщо цю перевірку колись обійдуть.
 */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireOwner();
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const supabase = createSupabaseServiceRoleClient();

  const { data: existing } = await supabase.from("admin_roles").select("is_owner").eq("id", params.id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Роль не знайдено" }, { status: 404 });
  if (existing.is_owner) return NextResponse.json({ error: "Роль власника не можна видалити" }, { status: 400 });

  const { count } = await supabase
    .from("admin_users")
    .select("id", { count: "exact", head: true })
    .eq("role_id", params.id);
  if (count && count > 0) {
    return NextResponse.json(
      { error: `Не можна видалити — призначена ${count} ${count === 1 ? "користувачу" : "користувачам"}` },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("admin_roles").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
