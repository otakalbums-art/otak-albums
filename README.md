# Otak Albums

Платформа для випускних фотозйомок: клієнтський сайт для учнів + адмін-панель
для фотографа. Монорепо на pnpm workspaces + Turborepo, дизайн — варіант 3
(біла картка, #460464, аналітичний SaaS-стиль), БД — Supabase.

## Структура

```
otak-albums/
├── apps/
│   ├── client/          Next.js 14 — клієнтський сайт (учні)
│   └── admin/            Next.js 14 — адмін-панель (фотограф)
├── packages/
│   ├── ui/                Спільна дизайн-система (Card, Button, PhotoTile,
│   │                      Donut, ProgressRing, Toggle, StatusChip…)
│   ├── supabase/           Типізовані Supabase-клієнти (browser/server/service-role)
│   └── config/            Спільний Tailwind-пресет (кольори/шрифти/тіні)
├── supabase/
│   ├── migrations/0001_init.sql   Повна схема БД + RLS
│   ├── seed.sql                    Демо-дані для локальної розробки
│   └── config.toml
└── docs/
    ├── auth-strategy.md            Чому учні НЕ через Supabase Auth
    └── backup-strategy.md          Варіанти "віртуального бекап-сервера"
```

## Швидкий старт

Знадобляться: Node.js ≥20, pnpm ≥9, [Supabase CLI](https://supabase.com/docs/guides/cli), Docker (для локального Supabase).

```bash
pnpm install

# 1. Підняти локальний Supabase (Postgres + Storage + Studio в Docker)
pnpm db:start
#   -> виведе local API URL, anon key, service_role key

# 2. Скопіювати env-файли й вставити ключі з кроку 1
cp apps/client/.env.local.example apps/client/.env.local
cp apps/admin/.env.local.example apps/admin/.env.local

# 3. Згенерувати типи БД з реальної схеми
pnpm db:types

# 4. Запустити обидва застосунки одночасно
pnpm dev
#   client → http://localhost:3000
#   admin  → http://localhost:3001
```

Supabase Studio (перегляд таблиць, редагування даних вручну) —
зазвичай `http://localhost:54323` після `pnpm db:start`.

## Що вже зроблено в цьому каркасі

- Повна схема БД під ТЗ: школи, класи, учні, фото, обране, відбір для
  альбому, типи альбомів (з `folder_template`), посилання для мам
  (локальне/глобальне вимкнення), адміни, RLS-політики.
- Дизайн-система `@otak/ui` — React-компоненти 1:1 з макетом варіанту 3,
  на Tailwind, готові для клієнта й адмінки.
- Каркас сторінок: вхід за інвайтом, галерея (з real-time підпискою на нові
  фото), відбір для альбому, посилання для мам — на клієнті; дашборд, класи,
  типи альбомів, посилання для мам, бекап — в адмінці.
- Робочий приклад пари route handlers (`/api/auth/login`, `/api/photos`),
  що показує обраний патерн авторизації учнів (див. `docs/auth-strategy.md`).
- **Завантаження фото фотографом**, двома шляхами: веб-форма в адмінці
  (drag&drop, `apps/admin/app/classes/[classId]/upload`) і, для реал-тайм
  зйомки, прийом напряму з Wi-Fi камер по FTP
  (`apps/admin/scripts/ftp-ingest.mjs`, докладно — `docs/camera-ftp-ingest.md`).
  Один FTP-логін на клас обслуговує кілька камер одночасно — категорія
  фото визначається цільовою папкою (Directory) в налаштуваннях FTP
  кожної окремої камери. Обидва шляхи приймають і JPEG, і RAW
  (`apps/admin/lib/file-type.ts`) і самі розкладають кожен кадр у
  підпапку `JPEG/` чи `RAW/` усередині категорії — учні бачать лише
  JPEG (`apps/client/app/api/photos/route.ts`), адмін — обидва типи, у
  галереї `apps/admin/app/classes/[classId]/photos`.
- **Signed URLs для прев'ю/повнорозмірних фото** — для учнів
  (`apps/client/app/api/photos/route.ts`), для "посилання для мам"
  (`apps/client/app/mom-link`) і для адмінської галереї
  (`apps/admin/app/api/classes/[classId]/photos/route.ts`). Учні й моми
  бачать лише JPEG (`file_type = 'jpeg'`), адмін — і JPEG, і RAW.

## Що лишилось доробити (наступні кроки розробки)

1. Реалізувати решту route handlers за аналогією з прикладами:
   `/api/photos/[id]/favorite`, `/api/photos/[id]/select`,
   `/api/album-selection/confirm`, `/api/mom-links`, `/api/mom-links/[id]`,
   `/api/mom-links/global`, `/api/admin/classes` (створення папки класу +
   генерація `referral_code` + копіювання `folder_template` у Storage).
2. Автентифікація адмінів у `apps/admin` (сторінка логіну + middleware, що
   редіректить неавторизованих на неї) — поки що сторінки вважають, що
   сесія вже є.
3. Реальні агрегати для дашборду (SQL view або RPC-функція замість
   спрощеного підрахунку в `apps/admin/app/page.tsx`).
4. Обрати й реалізувати варіант "бекап-сервера" з `docs/backup-strategy.md`.

## Дизайн

Кольори й шрифти — у `packages/config/tailwind-preset.js` та
`packages/ui/src/tokens.ts`. Змінювати треба лише там — обидва застосунки
підхоплять зміни автоматично.

<!-- trigger: force fresh Vercel deployment after making repo public -->
