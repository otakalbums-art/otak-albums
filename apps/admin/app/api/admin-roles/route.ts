import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { requireOwner } from "@/lib/require-admin";
import { TAB_KEYS } from "@/lib/admin-tabs";

/**
 * GET  /api/admin-roles — список ролей (для сторінки "Користувачі та ролі"
 *      і для селекта ролі при створенні/редагуванні адміна).
 * POST /api/admin-roles — створити нову роль { name, tabKeys: string[] }.
 * Лише власники (supabase/migrations/0009_admin_roles.sql) — сторінка
 * керування користувачами/ролями не є звичайною вкладкою.
 */
export async function GET() {
  const user = await requireOwner();
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const supabase = createSupabaseServiceRoleClient();
  const { data: roles, error } = await supabase.from("admin_roles").select("*").order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ roles: roles ?? [] });
}

export async function POST(req: Request) {
  const user = await requireOwner();
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const { name, tabKeys } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Вкажіть назву ролі" }, { status: 400 });

  const keys: string[] = Array.isArray(tabKeys) ? tabKeys : [];
  const invalid = keys.filter((k) => !TAB_KEYS.includes(k as any));
  if (invalid.length > 0) {
    return NextResponse.json({ error: `Невідомі вкладки: ${invalid.join(", ")}` }, { status: 400 });
  }

  const supabase = createSupabaseServiceRoleClient();
  const { data: role, error } = await supabase
    .from("admin_roles")
    .insert({ name: name.trim(), tab_keys: keys })
    .select("*")
    .single();

  if (error) {
    const message = error.code === "23505" ? "Роль з такою назвою вже є" : error.message;
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ role });
}
