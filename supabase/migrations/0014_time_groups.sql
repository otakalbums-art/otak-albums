-- ============================================================================
-- Часові групи: кілька проміжків зйомки з власним кольором і назвою
-- ============================================================================
-- Замість одного діапазону (slot_start/slot_end/slot_interval_min) адмін
-- задає групи, напр. "Група 1" 16:00–16:20 по 5 хв = 4 дитини. Слоти в межах
-- групи: від start до end (не включно) з кроком interval.
-- Формат: [{"id","name","color":"#RRGGBB","start":"HH:MM","end":"HH:MM","interval":5}]
-- ============================================================================

alter table classes add column time_groups jsonb not null default '[]'::jsonb;
comment on column classes.time_groups is
  'Часові групи зйомки: [{id,name,color,start,end,interval}] — слоти від start (вкл.) до end (не вкл.) з кроком interval хв.';

-- Наявний один діапазон -> "Група 1" (кінець +крок, бо раніше останній слот входив у діапазон).
update classes
set time_groups = jsonb_build_array(jsonb_build_object(
  'id', 'g1',
  'name', 'Група 1',
  'color', '#8C57A8',
  'start', to_char(slot_start, 'HH24:MI'),
  'end', to_char(slot_end + make_interval(mins => slot_interval_min), 'HH24:MI'),
  'interval', slot_interval_min
))
where slot_start is not null and slot_end is not null;

comment on column classes.slot_start is 'Застаріле (до 0014) — замінено на time_groups.';
comment on column classes.slot_end is 'Застаріле (до 0014) — замінено на time_groups.';
comment on column classes.slot_interval_min is 'Застаріле (до 0014) — замінено на time_groups.';
