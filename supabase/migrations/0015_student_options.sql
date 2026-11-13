-- ============================================================================
-- Додаткові послуги, замовлені конкретною дитиною
-- ============================================================================
-- Каталог послуг — album_options (0012, редагується на /album-types). Тут —
-- хто що замовив і скільки. Додає адмін у CRM; у кабінеті батьків видно, що
-- замовили діти групи (без цін).
-- ============================================================================

create table student_options (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  -- restrict: послугу, яку вже хтось замовив, не можна мовчки видалити з каталогу.
  option_id uuid not null references album_options(id) on delete restrict,
  quantity int not null default 1 check (quantity >= 1),
  unit_price numeric,  -- знімок ціни на момент додавання
  created_at timestamptz not null default now(),
  unique (student_id, option_id)
);

create index student_options_student_idx on student_options (student_id);

alter table student_options enable row level security;
create policy "admins_full_access_student_options" on student_options
  for all using (is_admin()) with check (is_admin());
