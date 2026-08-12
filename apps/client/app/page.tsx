import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// Кореневий маршрут: якщо є cookie сесії учня — на галерею (саму валідність
// session_token все одно перевірить /api/photos й поверне 401 → редірект на
// /login з клієнта), інакше одразу на вхід. cookies() тут навмисно — без
// звернення до request-даних Next.js статично закешовує цю сторінку під час
// білду, і тоді redirect() віддає 307 БЕЗ заголовка Location (перевірено на
// проді otak-albums-client.vercel.app: сторінка "зависала" порожньою).
export default function Home() {
  const hasSession = Boolean(cookies().get("otak_session")?.value);
  redirect(hasSession ? "/gallery" : "/login");
}
