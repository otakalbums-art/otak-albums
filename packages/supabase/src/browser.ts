"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

/**
 * Клієнт для використання в client components (галерея, real-time підписки на нові фото тощо).
 * Використовує лише публічний anon key — жодних привілейованих операцій.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
