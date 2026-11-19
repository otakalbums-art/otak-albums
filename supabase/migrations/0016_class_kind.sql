-- ============================================================================
-- Тип запису: клас школи або група дитячого садка
-- ============================================================================
-- Одна таблиця classes для обох — уся логіка (CRM, кабінет, фото, камери)
-- однакова; kind лише змінює підписи в адмінці й стартові налаштування
-- (група садочка одразу отримує анкету садочка).
-- ============================================================================

alter table classes add column kind text not null default 'school'
  check (kind in ('school', 'kindergarten'));
comment on column classes.kind is 'school — клас школи, kindergarten — група дитячого садка.';

-- Наявні садочки: заклад із "сад" у назві (напр. "33 садок") — групи садочка.
update classes c
set kind = 'kindergarten'
from schools s
where s.id = c.school_id and s.name ilike '%сад%';

-- Статус "pending" ніде в адмінці не змінювався на "active", тож нові класи
-- назавжди лишались "Очікує" і не потрапляли на прийом з камер. Тепер клас
-- активний одразу після створення; неактивний = лише архів.
update classes set status = 'active' where status = 'pending';
alter table classes alter column status set default 'active';
