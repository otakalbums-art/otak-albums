-- ============================================================================
-- Вартість/собівартість типу альбому + мінімальний облік оплат на учня
-- ============================================================================
-- Ціна — за один екземпляр (кожен учень купує свій примірник альбому), тому
-- живе на album_types, а факт замовлення/оплати — на кожному учні окремо
-- (той самий підхід, що й students.is_staff: зв'язок 1:1, нова колонка на
-- students, а не окрема таблиця замовлень — простіше, і тут цього досить).
-- ============================================================================

alter table album_types add column price numeric;
alter table album_types add column cost_price numeric;

comment on column album_types.price is 'Вартість одного екземпляра альбому (на учня), грн.';
comment on column album_types.cost_price is 'Собівартість одного екземпляра — необов''язково, для підрахунку прибутку.';

alter table students add column order_status text not null default 'not_ordered'
  check (order_status in ('not_ordered', 'ordered', 'paid'));
alter table students add column order_amount numeric;
alter table students add column ordered_at timestamptz;
alter table students add column paid_at timestamptz;

comment on column students.order_amount is
  'Знімок фактичної суми на момент замовлення — не змінюється заднім числом, якщо album_types.price зміниться пізніше.';
