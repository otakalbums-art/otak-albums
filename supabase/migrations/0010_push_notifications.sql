-- ============================================================================
-- Push-сповіщення для адмінки (Web Push)
-- ============================================================================
-- push_subscriptions — підписки браузера/пристрою на push, прив'язані до
-- конкретного адміна (apps/admin/app/notifications-toggle.tsx,
-- apps/admin/app/api/push/subscribe/route.ts). Хто саме отримує яке
-- сповіщення — рахується в коді (packages/push/src/index.ts) за
-- admin_roles.tab_keys/is_owner, тут лише сирі підписки.
-- ============================================================================

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references admin_users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index push_subscriptions_admin_id_idx on push_subscriptions(admin_id);

alter table push_subscriptions enable row level security;
create policy "admins_full_access_push_subscriptions" on push_subscriptions
  for all using (is_admin()) with check (is_admin());

-- Перший вхід учня (сповіщення "новий учень приєднався") — раніше
-- session_token просто беззастережно перезаписувався щоразу, без
-- фіксації, чи це взагалі перший логін.
alter table students add column first_login_at timestamptz;

-- Анти-спам для перевірки посилань для мам (apps/admin/scripts/push-scheduler.mjs) —
-- це єдине з 6 сповіщень, яке не прив'язане до конкретної дії, а
-- перевіряється періодично, тож потребує позначки "вже сповістили".
alter table mom_links add column expiring_soon_notified_at timestamptz;
alter table mom_links add column expired_notified_at timestamptz;
