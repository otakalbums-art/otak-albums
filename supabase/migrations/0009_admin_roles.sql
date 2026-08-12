-- ============================================================================
-- Ролі та доступи в адмін-панелі (RBAC)
-- ============================================================================
-- admin_roles — довільно названі ролі з набором дозволених вкладок
-- (tab_keys, перевіряється в коді — apps/admin/lib/admin-tabs.ts,
-- apps/admin/lib/require-admin.ts, apps/admin/middleware.ts). Роль
-- "Власник" (is_owner=true) — захищена: не видаляється, завжди має
-- доступ до всього, включно з новою сторінкою "Користувачі та ролі",
-- яка НЕ є звичайною вкладкою й не призначається іншим ролям.
-- ============================================================================

create table admin_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  tab_keys text[] not null default '{}',
  is_owner boolean not null default false,
  created_at timestamptz not null default now()
);

alter table admin_roles enable row level security;
create policy "admins_full_access_admin_roles" on admin_roles
  for all using (is_admin()) with check (is_admin());

insert into admin_roles (name, is_owner, tab_keys) values ('Власник', true, '{}');

alter table admin_users add column role_id uuid references admin_roles(id) on delete restrict;
update admin_users set role_id = (select id from admin_roles where is_owner);
alter table admin_users alter column role_id set not null;

-- Старий фіксований role text('admin'|'photographer') ніде в коді не
-- використовувався (requireAdmin() лише перевіряв факт наявності рядка) —
-- замінюється на role_id вище.
alter table admin_users drop column role;
