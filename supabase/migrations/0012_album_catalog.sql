-- ============================================================================
-- Каталог альбомів: категорії, додаткові опції, націнка за малий тираж
-- ============================================================================
-- Прайс із таблиці студії переїжджає в систему й редагується на сторінці
-- "Типи альбомів" в адмінці:
--   * album_types.category    — група ("Садочок", "4-ті класи", "Старші (9-11)").
--                               Вільний текст, щоб можна було додати нову без міграції.
--   * album_types.sort_order  — порядок показу в межах сторінки/випадного списку.
--   * album_options           — додаткові платні опції (індивідуальний розворот тощо).
--   * album_small_run_markups — націнка до базової ціни, якщо в класі мало альбомів.
--                               Довідкова: сума замовлення учня й далі вводиться вручну.
-- ============================================================================

alter table album_types add column category text;
alter table album_types add column sort_order int not null default 0;

comment on column album_types.category is 'Група типу альбому: "Садочок", "4-ті класи", "Старші (9-11)"... Вільний текст.';

create table album_options (
  id uuid primary key default gen_random_uuid(),
  category text,
  name text not null,
  price numeric,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

comment on table album_options is 'Додаткові платні опції до альбому (за шт.), редагуються на /album-types.';

create table album_small_run_markups (
  id uuid primary key default gen_random_uuid(),
  min_albums int,          -- null = без нижньої межі
  max_albums int,          -- null = без верхньої межі
  surcharge numeric not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

comment on table album_small_run_markups is
  'Націнка за малий тираж: якщо в класі від min_albums до max_albums альбомів — +surcharge грн до базової ціни.';

alter table album_options enable row level security;
alter table album_small_run_markups enable row level security;
create policy "admins_full_access_album_options" on album_options
  for all using (is_admin()) with check (is_admin());
create policy "admins_full_access_album_small_run_markups" on album_small_run_markups
  for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- Початкові дані — прайс студії (листопад 2026)
-- ---------------------------------------------------------------------------
insert into album_types (name, category, price, sort_order, folder_template) values
  ('Альбом на дві фотосесії', 'Садочок',       2000, 10,  '[]'),
  ('Альбом на одну фотосесію', 'Садочок',      1600, 20,  '[]'),
  ('Емоції (2 портрети)',      '4-ті класи',    1850, 30,  '[]'),
  ('Наш клас (1 портрет)',     '4-ті класи',    1500, 40,  '[]'),
  ('Наш клас (2 портрети)',    '4-ті класи',    1650, 50,  '[]'),
  ('Шкільний',                 '4-ті класи',    1300, 60,  '[]'),
  ('Альбом 1',                 'Старші (9-11)', 1700, 70,  '[]'),
  ('Альбом 2',                 'Старші (9-11)', 2000, 80,  '[]'),
  ('Альбом 3',                 'Старші (9-11)', 2200, 90,  '[]'),
  ('Альбом 4',                 'Старші (9-11)', 2700, 100, '[]');

insert into album_options (category, name, price, sort_order) values
  ('Садочок',    'Індивідуальний розворот (за шт.)', 300, 10),
  ('4-ті класи', 'Емоції — доплата за 5 портретів',  150, 20);

insert into album_small_run_markups (min_albums, max_albums, surcharge, sort_order) values
  (10,   14, 250, 10),
  (null,  9, 500, 20);
