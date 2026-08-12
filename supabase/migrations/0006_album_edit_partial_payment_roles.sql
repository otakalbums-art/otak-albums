-- ============================================================================
-- Часткова оплата + ролі персоналу
-- ============================================================================

-- Часткова оплата: 4-й статус + сума фактично внесеного.
alter table students drop constraint students_order_status_check;
alter table students add constraint students_order_status_check
  check (order_status in ('not_ordered', 'ordered', 'partially_paid', 'paid'));
alter table students add column paid_amount numeric not null default 0;
comment on column students.paid_amount is 'Скільки фактично внесено — order_amount - paid_amount = залишок до сплати.';

-- Ролі персоналу — заміна узагальненого "персонал" конкретною посадою.
alter table students add column staff_role text;
comment on column students.staff_role is
  'Конкретна посада для персоналу ("Класний керівник", "Директор", своя) — is_staff лишається похідним булевим прапорцем (true, коли staff_role задано), щоб не переписувати наявні запити/сортування/фінансові фільтри.';
