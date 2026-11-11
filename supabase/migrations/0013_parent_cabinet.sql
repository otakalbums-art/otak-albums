-- ============================================================================
-- Особистий кабінет дитини (садочок): анкета, час зйомки, завдаток/доплата
-- ============================================================================
-- Заміна спільної Google-таблиці групи. Кожна дитина отримує постійне
-- персональне посилання (students.access_token) — батьки за ним до
-- фотосесії обирають час зі вільних слотів і заповнюють анкету, бачать
-- дані інших дітей лише на перегляд. Адмін задає дату зйомки, проміжок
-- між дітьми і може вимкнути редагування для всієї групи.
-- ============================================================================

-- --- Налаштування класу/групи ----------------------------------------------
alter table classes add column shoot_date date;
alter table classes add column slot_start time;
alter table classes add column slot_end time;
alter table classes add column slot_interval_min int not null default 7
  check (slot_interval_min between 1 and 240);
alter table classes add column parent_editing_enabled boolean not null default true;
-- Питання анкети: [{"key":"dream","label":"Моя мрія"}, ...]. Порожньо = анкети немає.
alter table classes add column questions jsonb not null default '[]'::jsonb;

comment on column classes.shoot_date is 'Дата фотосесії — задає адмін.';
comment on column classes.slot_start is 'Початок часових слотів для батьків (разом зі slot_end і slot_interval_min).';
comment on column classes.parent_editing_enabled is 'false — батьки бачать дані, але нічого не можуть змінити.';
comment on column classes.questions is 'Питання анкети для батьків, масив {key,label}.';

-- --- Дані дитини -------------------------------------------------------------
-- Постійний токен персонального посилання; діє, доки дитину не видалили.
alter table students add column access_token text not null
  default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
create unique index students_access_token_idx on students (access_token);

alter table students add column shoot_time time;
-- Один час — одна дитина в межах класу.
create unique index students_class_shoot_time_idx on students (class_id, shoot_time) where shoot_time is not null;

alter table students add column deposit_amount numeric;
alter table students add column extra_payment_amount numeric;
comment on column students.deposit_amount is 'Завдаток — вносить адмін.';
comment on column students.extra_payment_amount is 'Доплата — вносить адмін.';

-- Наявні суми "внесено" переносимо в завдаток, щоб нічого не загубилось.
update students set deposit_amount = paid_amount where paid_amount > 0;

-- "Внесено" (paid_amount, з нього рахує дашборд) = завдаток + доплата, завжди.
create or replace function students_sync_paid_amount() returns trigger
language plpgsql as $$
begin
  new.paid_amount := coalesce(new.deposit_amount, 0) + coalesce(new.extra_payment_amount, 0);
  return new;
end;
$$;

create trigger students_sync_paid_amount
  before insert or update on students
  for each row execute function students_sync_paid_amount();

-- --- Відповіді анкети --------------------------------------------------------
create table student_answers (
  student_id uuid not null references students(id) on delete cascade,
  question_key text not null,
  answer text not null default '',
  updated_at timestamptz not null default now(),
  primary key (student_id, question_key)
);

alter table student_answers enable row level security;
create policy "admins_full_access_student_answers" on student_answers
  for all using (is_admin()) with check (is_admin());
