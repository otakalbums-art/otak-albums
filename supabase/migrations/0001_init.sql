-- ============================================================================
-- Otak Albums — початкова схема БД
-- ============================================================================
-- Стратегія авторизації (детальніше: docs/auth-strategy.md):
--   • Адміни  -> Supabase Auth (email+password), записуються в admin_users,
--                мають повний RLS-доступ через is_admin().
--   • Учні    -> НЕ є Supabase Auth-користувачами. Вхід за прізвищем+ім'ям
--                перевіряється вручну в Next.js route handler (apps/client),
--                який працює через service_role client (обходить RLS).
--                Тому нижче для "учнівських" таблиць RLS увімкнено, але
--                публічних policy для anon-ролі немає — доступ лише через
--                довірений сервер із service_role ключем.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Довідники
-- ---------------------------------------------------------------------------
create table schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table album_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,                          -- "Стандарт", "Преміум", ...
  page_count int,
  -- Шаблон структури підпапок для цього типу альбому, напр.:
  -- [{"name":"Портрети"},{"name":"Групові"},{"name":"Церемонія"}]
  folder_template jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Класи (= папка класу в термінах ТЗ)
-- ---------------------------------------------------------------------------
create table classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  album_type_id uuid references album_types(id),
  name text not null,                            -- "11-А"
  referral_code text not null unique,             -- напр. "11a-x7qk29"
  status text not null default 'pending'
    check (status in ('pending', 'active', 'archived')),
  created_at timestamptz not null default now()
);

create index classes_school_id_idx on classes (school_id);

-- ---------------------------------------------------------------------------
-- Учні (заповнюється відповідальною особою з класу через форму-інвайт)
-- ---------------------------------------------------------------------------
create table students (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  -- Видається після успішного входу за прізвищем+ім'ям, зберігається як
  -- httpOnly cookie на клієнті. Використовується для ідентифікації
  -- наступних запитів без пароля.
  session_token text unique,
  session_expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (class_id, last_name, first_name)
);

create index students_class_id_idx on students (class_id);

-- ---------------------------------------------------------------------------
-- Фото
-- ---------------------------------------------------------------------------
create table photos (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  -- Шлях у Supabase Storage bucket "photos", що відображає логічну структуру:
  --   {school}/{class}/vybrani/portrety/DSC_1024.jpeg
  --   {school}/{class}/{student_id}/DSC_1030.jpeg
  storage_path text not null,
  filename text not null,
  file_type text not null default 'jpeg' check (file_type = 'jpeg'), -- автофільтрація за типом
  category text not null default 'uncategorized'
    check (category in ('portrait', 'group', 'ceremony', 'personal', 'uncategorized')),
  -- Заповнено, якщо фото належить до персональної підпапки учня
  student_id uuid references students(id) on delete set null,
  uploaded_at timestamptz not null default now()
);

create index photos_class_id_idx on photos (class_id);
create index photos_student_id_idx on photos (student_id);

-- ---------------------------------------------------------------------------
-- Обрані (лайки) — крок 1 відбору
-- ---------------------------------------------------------------------------
create table favorites (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  photo_id uuid not null references photos(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (student_id, photo_id)
);

-- ---------------------------------------------------------------------------
-- Відбір для альбому — крок 2 (підмножина обраного)
-- ---------------------------------------------------------------------------
create table album_selections (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  photo_id uuid not null references photos(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (student_id, photo_id)
);

-- ---------------------------------------------------------------------------
-- Посилання для мам
-- ---------------------------------------------------------------------------
create table mom_links (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  is_active boolean not null default true,   -- локальне вимкнення адміном
  created_at timestamptz not null default now()
);

create index mom_links_class_id_idx on mom_links (class_id);

-- Глобальний перемикач (одна службова таблиця-синглтон)
create table global_settings (
  id boolean primary key default true check (id),
  mom_links_globally_disabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into global_settings (id) values (true);

-- ---------------------------------------------------------------------------
-- Адміни (пов'язані з Supabase Auth)
-- ---------------------------------------------------------------------------
create table admin_users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'admin' check (role in ('admin', 'photographer')),
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Row Level Security
-- ============================================================================
create or replace function is_admin()
returns boolean
language sql stable security definer
as $$
  select exists (select 1 from admin_users where id = auth.uid());
$$;

alter table schools enable row level security;
alter table album_types enable row level security;
alter table classes enable row level security;
alter table students enable row level security;
alter table photos enable row level security;
alter table favorites enable row level security;
alter table album_selections enable row level security;
alter table mom_links enable row level security;
alter table global_settings enable row level security;
alter table admin_users enable row level security;

-- Адмінка (Supabase Auth) має повний доступ до всього.
create policy "admins_full_access_schools" on schools for all using (is_admin()) with check (is_admin());
create policy "admins_full_access_album_types" on album_types for all using (is_admin()) with check (is_admin());
create policy "admins_full_access_classes" on classes for all using (is_admin()) with check (is_admin());
create policy "admins_full_access_students" on students for all using (is_admin()) with check (is_admin());
create policy "admins_full_access_photos" on photos for all using (is_admin()) with check (is_admin());
create policy "admins_full_access_favorites" on favorites for all using (is_admin()) with check (is_admin());
create policy "admins_full_access_album_selections" on album_selections for all using (is_admin()) with check (is_admin());
create policy "admins_full_access_mom_links" on mom_links for all using (is_admin()) with check (is_admin());
create policy "admins_full_access_global_settings" on global_settings for all using (is_admin()) with check (is_admin());

-- Адмін бачить лише свій власний рядок в admin_users (керування ролями — через service role/дашборд).
create policy "admin_reads_self" on admin_users for select using (id = auth.uid());

-- Для anon-ролі (учні, публічний "перегляд для мам") жодних policy не додано:
-- увесь student-facing доступ проходить через apps/client route handlers
-- із service_role client, де авторизація перевіряється вручну.
