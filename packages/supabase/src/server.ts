import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./types";

/**
 * Клієнт для server components / route handlers у Next.js App Router.
 * Читає/пише сесійні cookies (для адмінів через Supabase Auth).
 */
export function createSupabaseServerClient() {
  const cookieStore = cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.set({ name, value: "", ...options });
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
 */
export function createSupabaseServiceRoleClient() {
  const { createClient } = require("@supabase/supabase-js");
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
