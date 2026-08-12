import webpush from "web-push";
import type { createSupabaseServiceRoleClient } from "@otak/supabase/server";

type ServiceClient = ReturnType<typeof createSupabaseServiceRoleClient>;

let configured = false;
function ensureConfigured() {
  if (configured) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    throw new Error("VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT не задані в env");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

/**
 * Хто з admin_users отримує сповіщення — той самий патерн вибірки, що й
 * requireAdmin()/countOwners (apps/admin/lib/require-admin.ts,
 * apps/admin/app/api/admin-users/[id]/route.ts): читаємо весь admin_users
 * join admin_roles і фільтруємо в JS — адмінів завжди мало, це не
 * проблема продуктивності. tab — рядковий ключ (не TabKey з
 * apps/admin/lib/admin-tabs.ts навмисно — цей пакет спільний і з
 * apps/client, який не має доступу до lib/ адмінки).
 */
async function resolveRecipients(
  supabase: ServiceClient,
  opts: { tab?: string; ownersOnly?: boolean; excludeAdminId?: string }
) {
  const { data } = await supabase.from("admin_users").select("id, admin_roles(is_owner, tab_keys)");
  return (data ?? [])
    .filter((u: any) => {
      if (opts.excludeAdminId && u.id === opts.excludeAdminId) return false;
      const role = u.admin_roles;
      if (role?.is_owner) return true;
      if (opts.ownersOnly) return false;
      return opts.tab ? (role?.tab_keys ?? []).includes(opts.tab) : false;
    })
    .map((u: any) => u.id as string);
}

type PushPayload = { title: string; body: string; url: string };

/**
 * Надсилає одному payload'ом усім переданим admin_id — спільне ядро для
 * notifyAdmins() (вибірка за tab/ownersOnly) і sendTestToAdmin() (пряма
 * відправка собі, в обхід вибірки). Протухлі підписки (410/404 від
 * push-сервісу) видаляє одразу. Помилки окремих відправлень не кидає
 * далі — виклик з route handler'а не має падати через те, що чийсь
 * браузер більше не приймає push.
 */
async function sendToAdminIds(supabase: ServiceClient, adminIds: string[], payload: PushPayload): Promise<void> {
  if (adminIds.length === 0) return;
  ensureConfigured();

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("admin_id", adminIds);
  if (!subs || subs.length === 0) return;

  const body = JSON.stringify(payload);

  await Promise.all(
    subs.map(async (sub: any) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body);
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          console.error("[push] не вдалось надіслати:", err?.message ?? err);
        }
      }
    })
  );
}

export type NotifyOptions = PushPayload & {
  tab?: string;
  ownersOnly?: boolean;
  excludeAdminId?: string;
};

/**
 * Надсилає push-сповіщення всім адмінам, які мають доступ до вкладки
 * `tab` (або лише власникам, якщо `ownersOnly`).
 */
export async function notifyAdmins(supabase: ServiceClient, opts: NotifyOptions): Promise<void> {
  const adminIds = await resolveRecipients(supabase, opts);
  await sendToAdminIds(supabase, adminIds, { title: opts.title, body: opts.body, url: opts.url });
}

/** Тестове сповіщення напряму одному адміну (кнопка "Надіслати тестове") — в обхід вибірки за tab/ownersOnly. */
export async function sendTestToAdmin(supabase: ServiceClient, adminId: string): Promise<void> {
  await sendToAdminIds(supabase, [adminId], {
    title: "Тестове сповіщення",
    body: "Якщо ви це бачите — push працює 🎉",
    url: "/",
  });
}
