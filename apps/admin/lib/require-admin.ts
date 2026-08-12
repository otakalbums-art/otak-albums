import { createSupabaseServerClient } from "@otak/supabase/server";
import type { TabKey } from "./admin-tabs";

/**
 * Перевіряє Supabase Auth-сесію (cookie), членство в admin_users і — якщо
 * передано tab — доступ ролі цього адміна до конкретної вкладки
 * (admin_roles.tab_keys, supabase/migrations/0009_admin_roles.sql).
 * Власник (is_owner=true) проходить будь-яку перевірку вкладки завжди.
 *
 * tab може бути масивом — для ендпоінтів, які обслуговують дві різні
 * вкладки одночасно (напр. GET /api/classes/[classId]/photos викликається
 * і зі сторінки "Класи та папки", і з пікера в CRM) — доступу достатньо
 * хоч по одній із переданих вкладок.
 *
 * Викликати без аргументу tab лише коли перевірка на конкретну вкладку не
 * потрібна (сторінка "Користувачі та ролі" використовує окрему
 * requireOwner() нижче, а не це).
 */
export async function requireAdmin(tab?: TabKey | TabKey[]) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: admin } = await supabase
    .from("admin_users")
    .select("id, admin_roles(is_owner, tab_keys)")
    .eq("id", user.id)
    .maybeSingle();
  if (!admin) return null;

  if (!tab) return user;

  const role = (admin as any).admin_roles;
  if (role?.is_owner) return user;

  const allowed = Array.isArray(tab) ? tab : [tab];
  const granted: string[] = role?.tab_keys ?? [];
  if (!allowed.some((t) => granted.includes(t))) return null;

  return user;
}

/**
 * Лише для розділу "Користувачі та ролі" (apps/admin/app/users/**,
 * apps/admin/app/api/admin-users/**, apps/admin/app/api/admin-roles/**) —
 * доступ мають виключно власники (admin_roles.is_owner), незалежно від
 * tab_keys будь-якої звичайної ролі.
 */
export async function requireOwner() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: admin } = await supabase
    .from("admin_users")
    .select("id, admin_roles(is_owner)")
    .eq("id", user.id)
    .maybeSingle();
  if (!admin || !(admin as any).admin_roles?.is_owner) return null;

  return user;
}
