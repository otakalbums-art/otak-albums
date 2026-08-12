import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "./types";

/**
 * Клієнт для server components / route handlers у Next.js App Router.
 * Читає/пише сесійні cookies (для адмінів через Supabase Auth).
 *
 * getAll/setAll — не застарілий {get,set,remove} (той видалили в
 * @supabase/ssr 0.6+, "will not be supported in the next major version",
 * саме так і сталось; довелось перейти при апгрейді на 0.12.4, потрібному
 * для сумісності типів із supabase-js 2.112 — див. коментар у types.ts).
 * `setAll` у server component (не route handler) кине помилку — Next.js
 * забороняє встановлювати cookies поза route handler'ом/server action;
 * ловимо й ігноруємо, це очікувано (middleware.ts і так оновлює сесію).
 */
export function createSupabaseServerClient() {
  const cookieStore = cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Викликано з server component, не route handler/server action —
            // безпечно ігнорувати, доки middleware.ts оновлює сесію.
          }
        },
      },
    }
  );
}

/**
 * Клієнт із service_role ключем — ТІЛЬКИ у route handlers/server actions.
 * Обходить RLS. Через нього проходить уся клієнтська (учнівська) логіка:
 * вхід за прізвищем/іменем, читання фото свого класу, лайки, відбір для альбому,
 * перегляд за "посиланням для мам" — бо учні не є Supabase Auth-користувачами,
 * авторизація для них перевіряється вручну (див. docs/auth-strategy.md).
 *
 * `global.fetch` з `cache: "no-store"` — БЕЗ цього supabase-js (postgrest-js)
 * ловиться на Next.js Data Cache: у server-компонентах, які не викликають
 * cookies()/headers() ніде (напр. apps/client/app/mom-link/[token]/page.tsx,
 * apps/client/app/login/[referralCode]/page.tsx), Next мовчки кешує
 * відповіді фетчів під капотом бібліотеки НАЗАВЖДИ (доки живий dev-сервер),
 * і навіть `export const dynamic = "force-dynamic"` на самій сторінці це не
 * прибирає — перевірено емпірично 2026-08-11: сирий fetch(..., {cache:
 * "no-store"}) в тому ж запиті бачив свіже значення з БД, а виклик через
 * supabase-js в той самий момент — застаріле. Через це щойно створене
 * "посилання для мам" одразу показувалось як неактивне. Прибиральна дія
 * (force-dynamic на сторінках) сама по собі НЕ рятує — фікс мусить бути
 * саме тут, на рівні клієнта.
 */
export function createSupabaseServiceRoleClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false },
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          fetch(input, { ...init, cache: "no-store" }),
      },
    }
  );
}
