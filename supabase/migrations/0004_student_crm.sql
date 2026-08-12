-- ============================================================================
-- CRM-блок: слоти фото/тексту на клас (за типом альбому) + значення на учня
-- ============================================================================
-- Заміна ручних Google Sheets на кожен клас/групу ("хто яке фото обрав під
-- портрет/студію", "цитата для сторінки в альбомі" тощо). Набір слотів
-- визначається один раз на тип альбому (album_types) — школа й садочок
-- мають різні слоти (див. apps/admin/app/album-types/[albumTypeId]/slots) —
-- і успадковується всіма класами цього типу. Значення слотів (фото або
-- текст) зберігаються окремо на кожного учня.
--
-- Персонал (класний керівник, вихователь, помічник) моделюється як
-- звичайний рядок `students` з is_staff = true — той самий набір слотів,
-- та сама галерея/логін, просто не рахується окремо в майбутній
-- статистиці відбору.
-- ============================================================================

alter table students add column is_staff boolean not null default false;
comment on column students.is_staff is
  'Персонал (класний керівник, вихователь, помічник) — трактується як звичайний рядок "учня" з тим самим набором CRM-слотів, галереєю й логіном, але не рахується окремо в статистиці відбору.';

create table album_type_slots (
  id uuid primary key default gen_random_uuid(),
  album_type_id uuid not null references album_types(id) on delete cascade,
  key text not null,                    -- стабільний машинний ключ, автогенерується з label
  label text not null,                  -- підпис у CRM-таблиці й на клієнті, напр. 'Портрет 1'
  kind text not null check (kind in ('photo', 'text')),
  max_photos int not null default 1 check (max_photos >= 1),  -- застосовується лише для kind='photo'
  filled_by text not null default 'admin' check (filled_by in ('admin', 'student')),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (album_type_id, key),
  -- Фото-слоти завжди проставляє адмін (обирає з реально завантажених
  -- фото) — filled_by='student' має сенс лише для текстових слотів.
  check (kind = 'text' or filled_by = 'admin')
);

create index album_type_slots_album_type_id_idx on album_type_slots (album_type_id);

create table student_slot_photos (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  slot_id uuid not null references album_type_slots(id) on delete cascade,
  photo_id uuid not null references photos(id) on delete cascade,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (student_id, slot_id, photo_id)
);

create index student_slot_photos_student_idx on student_slot_photos (student_id);
create index student_slot_photos_slot_idx on student_slot_photos (slot_id);

create table student_slot_answers (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  slot_id uuid not null references album_type_slots(id) on delete cascade,
  answer text not null default '',
  updated_at timestamptz not null default now(),
  unique (student_id, slot_id)
);

create index student_slot_answers_student_idx on student_slot_answers (student_id);

alter table album_type_slots enable row level security;
alter table student_slot_photos enable row level security;
alter table student_slot_answers enable row level security;

create policy "admins_full_access_album_type_slots" on album_type_slots for all using (is_admin()) with check (is_admin());
create policy "admins_full_access_student_slot_photos" on student_slot_photos for all using (is_admin()) with check (is_admin());
create policy "admins_full_access_student_slot_answers" on student_slot_answers for all using (is_admin()) with check (is_admin());

-- Без anon-policy — учні пишуть власні відповіді лише через
-- apps/client/app/api/profile (service_role client, вручну звіряє
-- otak_session), той самий підхід, що й /api/photos,
-- /api/photos/[id]/favorite (docs/auth-strategy.md).
