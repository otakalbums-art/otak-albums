-- Обличчя на фото (власна модель на сервері камер: OpenCV YuNet + SFace,
-- apps/admin/scripts/face-worker.py):
--   * автосортування: категорія з правилом auto_faces='single' отримує фото з
--     одним обличчям, 'multi' — з двома й більше (налаштовується на сторінці
--     «Категорії фото»);
--   * «Знайти мою дитину» в кабінеті батьків — лише за згодою батьків
--     (students.face_search_consent_at).

-- Правило автосортування для категорії (не більше однієї категорії на правило).
alter table public.photo_categories
  add column if not exists auto_faces text check (auto_faces in ('single', 'multi'));
create unique index if not exists photo_categories_auto_faces_uniq
  on public.photo_categories (auto_faces) where auto_faces is not null;
update public.photo_categories set auto_faces = 'single' where key = 'portrait' and auto_faces is null;
update public.photo_categories set auto_faces = 'multi' where key = 'group'
  and not exists (select 1 from public.photo_categories where auto_faces = 'multi');

-- Стан аналізу кожного JPEG.
alter table public.photos add column if not exists face_count integer;
alter table public.photos add column if not exists faces_analyzed_at timestamptz;
alter table public.photos add column if not exists faces_sorted_at timestamptz;
create index if not exists photos_faces_pending_idx
  on public.photos (uploaded_at) where faces_analyzed_at is null and file_kind = 'jpeg';

-- Камера перенадіслала кадр (новий файл у тому ж записі) — аналізуємо заново.
create or replace function public.photos_reset_faces() returns trigger
language plpgsql as $$
begin
  if new.storage_path is distinct from old.storage_path then
    new.faces_analyzed_at := null;
    new.face_count := null;
  end if;
  return new;
end $$;
drop trigger if exists photos_reset_faces on public.photos;
create trigger photos_reset_faces before update on public.photos
  for each row execute function public.photos_reset_faces();

-- Знайдені обличчя: рамка (частки від розміру кадру 0..1) і «відбиток» (128 чисел).
create table if not exists public.photo_faces (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.photos(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  face_index integer not null,
  box real[] not null,
  score real not null,
  embedding real[] not null,
  unique (photo_id, face_index)
);
create index if not exists photo_faces_class_idx on public.photo_faces (class_id);
alter table public.photo_faces enable row level security;
drop policy if exists "admins manage photo faces" on public.photo_faces;
create policy "admins manage photo faces" on public.photo_faces
  for all using (is_admin()) with check (is_admin());

-- Згода батьків на пошук дитини за обличчям.
alter table public.students add column if not exists face_search_consent_at timestamptz;
