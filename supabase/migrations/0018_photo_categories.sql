-- Категорії фото тепер керуються з адмінки («Класи та групи» → «Категорії фото»),
-- а не прописані в коді. key — латиницею, незмінний: це назва папки на FTP
-- для камери й частина шляху у Storage. label — назва, яку бачать адмін і батьки.
--   hidden_from_parents — фото цієї категорії не показуються батькам (галерея,
--                         обране, вибір для альбому, завантаження)
--   is_system           — службові категорії, які не можна видалити
--                         (personal — фото для одного учня; uncategorized — куди
--                         переходять фото з видаленої категорії)

create table if not exists public.photo_categories (
  key text primary key check (key ~ '^[a-z0-9][a-z0-9_-]{0,39}$'),
  label text not null check (length(trim(label)) between 1 and 60),
  sort_order integer not null default 0,
  hidden_from_parents boolean not null default false,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

insert into public.photo_categories (key, label, sort_order, is_system) values
  ('portrait', 'Портрети', 1, false),
  ('group', 'Групові', 2, false),
  ('ceremony', 'Церемонія', 3, false),
  ('personal', 'Персональні', 4, true),
  ('uncategorized', 'Без категорії', 5, true)
on conflict (key) do nothing;

-- Старий жорсткий список (check constraint) -> зовнішній ключ на таблицю.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.photos'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%category%'
  loop
    execute format('alter table public.photos drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.photos drop constraint if exists photos_category_fkey;
alter table public.photos
  add constraint photos_category_fkey foreign key (category) references public.photo_categories(key);

alter table public.photo_categories enable row level security;
drop policy if exists "admins manage photo categories" on public.photo_categories;
create policy "admins manage photo categories" on public.photo_categories
  for all using (is_admin()) with check (is_admin());
