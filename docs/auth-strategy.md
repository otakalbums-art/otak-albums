# Стратегія авторизації

Дві зовсім різні аудиторії — тому дві різні схеми:

## Адміни (apps/admin)
Звичайний **Supabase Auth** (email + пароль). Кожен адмін має рядок у `admin_users`.
RLS-політики в `supabase/migrations/0001_init.sql` перевіряють `is_admin()` — тобто
`auth.uid()` присутній у `admin_users`. Реєстрація нових адмінів — вручну через
Supabase Dashboard або `supabase.auth.admin.createUser` (service role), self-signup
вимкнено (`enable_signup = false` у `supabase/config.toml`).

## Учні (apps/client)
Учні **не** створюють акаунт і не мають пароля — вхід за прізвищем+ім'ям після
переходу за реферальним посиланням класу. Це навмисно НЕ Supabase Auth, бо:
- немає пошти/пароля в потоці за ТЗ;
- посилання видає одноразовий доступ на весь клас, а не персональний акаунт.

Натомість:
1. `POST /api/auth/login` (route handler, service-role клієнт) звіряє
   прізвище+ім'я з таблицею `students` у межах класу за `referral_code`.
2. При збігу генерується `session_token`, зберігається в `students.session_token`
   і видається як **httpOnly cookie** (`otak_session`).
3. Усі наступні запити учня (галерея, лайки, відбір) йдуть через route handlers
   apps/client, які резолвлять `otak_session` → `student_id` через service-role
   клієнт — RLS для anon-ролі свідомо залишений закритим (default deny), тому
   пряме звернення з браузера напряму до Supabase (в обхід Next.js API) неможливе.

### Чому не RLS-політики на основі custom JWT claims
Це можливо (через Supabase Auth Hooks / кастомний JWT signer), але для MVP
додає значну складність заради відносно невеликого виграшу — весь student-facing
трафік і так проходить через наш власний Next.js сервер. Якщо згодом знадобиться
пряма робота з Supabase з мобільного клієнта (у разі повернення до мобільного
застосунку), варто переглянути це рішення на користь custom claims.

## "Посилання для мам"
Ще простіше — без сесії взагалі. Публічна сторінка `/mom-link/[token]`
(server component) перевіряє `token` напряму проти таблиці `mom_links`
(expires_at, is_active, global_settings.mom_links_globally_disabled) і рендерить
read-only галерею. Кожен візит — окремий stateless запит.
