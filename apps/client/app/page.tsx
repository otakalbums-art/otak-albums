import { redirect } from "next/navigation";

// Кореневий маршрут: якщо є активна сесія учня — на галерею, інакше на вхід.
// TODO: перевірка session_token з cookie (packages/supabase server client).
export default function Home() {
  redirect("/login");
}
