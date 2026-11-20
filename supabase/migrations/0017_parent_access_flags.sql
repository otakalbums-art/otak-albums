-- Окремі перемикачі доступу батьків для класу/групи (адмінка → «Класи та групи»):
--   parent_gallery_enabled  — бачать фото в галереї (і своє «Обране»); вимкнено = приховано, нічого не видаляється
--   parent_download_enabled — можуть завантажувати оригінали JPEG (кнопка ⤓ і ZIP вибраних)
-- parent_editing_enabled (0013) тепер ще й замикає вибір фото у місця альбому та «Підтвердити відбір».
alter table public.classes add column if not exists parent_gallery_enabled boolean not null default true;
alter table public.classes add column if not exists parent_download_enabled boolean not null default true;
