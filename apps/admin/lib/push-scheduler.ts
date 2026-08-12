import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { notifyAdmins } from "@otak/push";

/**
 * Періодична перевірка "посилання для мам скоро/вже неактивне" — єдине з
 * 6 push-сповіщень, не прив'язане до дії користувача, а лише до плину
 * часу. Раніше це був окремий процес, який треба було вручну запускати в
 * терміналі (scripts/push-scheduler.mjs) — фотограф-непрограміст ніколи
 * б цього не зробив. Тепер це звичайний `setInterval` усередині самого
 * Next.js сервера адмінки: стартує сам, щойно хтось відкриє будь-яку
 * сторінку (виклик у apps/admin/app/layout.tsx), і живе, поки живий сам
 * сервер — без жодної окремої команди. `globalThis`-гвардія — той самий
 * прийом, що й у ftp-process-manager.ts, щоб пережити HMR-перезавантаження
 * модулів у dev-режимі й не наплодити кілька паралельних інтервалів.
 *
 * Реальний on/off — не старт/стоп процесу (як у FTP), а простий прапорець
 * у БД (global_settings.push_mom_link_checks_enabled,
 * supabase/migrations/0011_push_scheduler_toggle.sql): інтервал завжди
 * тікає, але при вимкненому прапорці одразу виходить — це набагато
 * надійніше за "не забути натиснути" на процес, який реально треба десь
 * тримати живим.
 */

const CHECK_INTERVAL_MS = 30 * 60 * 1000; // раз на 30 хв
const EXPIRING_SOON_MS = 24 * 60 * 60 * 1000; // "скоро" = протягом 24 год

type SchedulerState = { intervalHandle: ReturnType<typeof setInterval> | null; lastCheckAt: number | null };
const g = globalThis as unknown as { __pushScheduler?: SchedulerState };
if (!g.__pushScheduler) g.__pushScheduler = { intervalHandle: null, lastCheckAt: null };
const state = g.__pushScheduler;

async function checkMomLinks() {
  const supabase = createSupabaseServiceRoleClient();
  state.lastCheckAt = Date.now();

  const { data: settings } = await supabase
    .from("global_settings")
    .select("push_mom_link_checks_enabled")
    .single();
  if (!settings?.push_mom_link_checks_enabled) return;

  const nowIso = new Date().toISOString();
  const soonIso = new Date(Date.now() + EXPIRING_SOON_MS).toISOString();

  const [{ data: expiringSoon }, { data: expired }] = await Promise.all([
    supabase
      .from("mom_links")
      .select("id, classes(name)")
      .eq("is_active", true)
      .lt("expires_at", soonIso)
      .gt("expires_at", nowIso)
      .is("expiring_soon_notified_at", null),
    supabase
      .from("mom_links")
      .select("id, classes(name)")
      .is("expired_notified_at", null)
      .or(`is_active.eq.false,expires_at.lt.${nowIso}`),
  ]);

  for (const link of expiringSoon ?? []) {
    await notifyAdmins(supabase, {
      tab: "mom_links",
      title: "Посилання для мам скоро неактивне",
      body: `Клас ${(link as any).classes?.name ?? ""} — посилання діє менш ніж 24 год, варто продовжити`,
      url: "/mom-links",
    });
    await supabase.from("mom_links").update({ expiring_soon_notified_at: new Date().toISOString() }).eq("id", link.id);
  }

  for (const link of expired ?? []) {
    await notifyAdmins(supabase, {
      tab: "mom_links",
      title: "Посилання для мам неактивне",
      body: `Клас ${(link as any).classes?.name ?? ""} — посилання вже не працює, створіть нове`,
      url: "/mom-links",
    });
    await supabase.from("mom_links").update({ expired_notified_at: new Date().toISOString() }).eq("id", link.id);
  }
}

/** Викликати з layout.tsx — ідемпотентно, повторні виклики (на кожен запит) нічого не роблять, якщо інтервал уже запущено. */
export function ensureSchedulerRunning() {
  if (state.intervalHandle) return;
  checkMomLinks().catch((err) => console.error("[push-scheduler] помилка перевірки:", err));
  state.intervalHandle = setInterval(() => {
    checkMomLinks().catch((err) => console.error("[push-scheduler] помилка перевірки:", err));
  }, CHECK_INTERVAL_MS);
}

export function schedulerLastCheckAt() {
  return state.lastCheckAt;
}
