import { createSupabaseServerClient } from "@otak/supabase/server";

/**
 * Перевіряє Supabase Auth-сесію (cookie) і членство в admin_users.
 * Повертає auth-юзера, якщо це підтверджений адмін, інакше null.
 * Використовується у всіх /api route handlers адмінки замість дублювання перевірки.
 */
export async function requireAdmin() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: admin } = await supabase.from("admin_users").select("id").eq("id", user.id).maybeSingle();
  return admin ? user : null;
}
