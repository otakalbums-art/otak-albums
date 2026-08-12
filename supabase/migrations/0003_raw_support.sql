-- ============================================================================
-- Підтримка RAW-файлів поруч із JPEG
-- ============================================================================
-- Досі `photos.file_type` міг бути лише 'jpeg' — RAW-кадри з камери
-- ігнорувались ще на етапі прийому (FTP-приймач і форма завантаження в
-- адмінці). Тепер приймаються й RAW-формати; `file_type` зберігає конкретне
-- розширення (для інформативності й підпапки на диску), а `file_kind` —
-- узагальнений тип ('jpeg' / 'raw'), яким фільтрують видачу учням
-- (apps/client/app/api/photos/route.ts лишається на file_type = 'jpeg',
-- що дає той самий результат, бо file_kind з нього й виведений).
--
-- Список розширень має збігатися з RAW_EXTENSIONS у
-- apps/admin/lib/file-type.ts і продубльованим значенням у
-- apps/admin/scripts/ftp-ingest.mjs — тримай усі три місця синхронними.
-- ============================================================================

alter table photos drop constraint photos_file_type_check;

alter table photos add constraint photos_file_type_check
  check (file_type in (
    'jpeg',
    -- RAW-формати основних виробників
    'cr2', 'cr3',   -- Canon
    'nef', 'nrw',   -- Nikon
    'arw', 'sr2',   -- Sony
    'raf',          -- Fujifilm
    'orf',          -- Olympus/OM System
    'rw2',          -- Panasonic
    'pef',          -- Pentax
    'srw',          -- Samsung
    'x3f',          -- Sigma
    'dng'           -- Adobe DNG / узагальнений RAW
  ));

comment on column photos.file_type is
  'Точне розширення файлу (jpeg, cr2, nef, arw, ...) — визначає назву типової підпапки в Storage (JPEG/RAW).';

-- Узагальнений тип для фільтрації видачі (учні бачать лише file_kind = 'jpeg').
alter table photos add column file_kind text generated always as
  (case when file_type = 'jpeg' then 'jpeg' else 'raw' end) stored;

create index photos_class_id_file_kind_idx on photos (class_id, file_kind);
