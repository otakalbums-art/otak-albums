import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_TABS, pathToTab } from "@/lib/admin-tabs";

/**
 * Захист усіх адмінських сторінок:
 *  1. Без Supabase Auth-сесії — редірект на /login.
 *  2. Є сесія, але немає рядка в admin_users (чужий Supabase Auth-акаунт
 *     цього ж проєкту) — так само на /login. Раніше middleware перевіряв
 *     лише факт сесії, не членство в admin_users — сторінки (порожні
 *     через RLS, але видимі) пропускались.
 *  3. Є admin_users, але роль не власник і поточний шлях відповідає
 *     вкладці поза admin_roles.tab_keys (або це /users — сторінка
 *     "Користувачі та ролі", завжди лише для власників) — редірект на
 *     першу дозволену вкладку, або на /no-access, якщо дозволених немає.
 * Логін-сторінку й статичні файли пропускаємо без перевірки.
 */
export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          res.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          res.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLoginPage = req.nextUrl.pathname.startsWith("/login");

  if (!user && !isLoginPage) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (!user) return res; // на /login без сесії — нема що перевіряти далі

  const { data: admin } = await supabase
    .from("admin_users")
    .select("admin_roles(is_owner, tab_keys)")
    .eq("id", user.id)
    .maybeSingle();

  if (!admin) {
    // Сесія валідна, але це не підтверджений адмін цього застосунку.
    if (isLoginPage) return res;
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (isLoginPage) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  const role = (admin as any).admin_roles as { is_owner: boolean; tab_keys: string[] } | null;
  const isOwner = !!role?.is_owner;
  const granted = role?.tab_keys ?? [];

  if (!isOwner) {
    const tab = pathToTab(req.nextUrl.pathname);
    const denied = tab === "users" || (tab !== null && !granted.includes(tab));
    if (denied) {
      const firstAllowedHref = ADMIN_TABS.find((t) => granted.includes(t.key))?.href;
      const url = req.nextUrl.clone();
      url.pathname = firstAllowedHref ?? "/no-access";
      if (url.pathname !== req.nextUrl.pathname) return NextResponse.redirect(url);
    }
  }

  return res;
}

export const config = {
  // Крім _next/static — виключаємо ще й статичні файли (public/logo.png,
  // App Router-івську favicon-конвенцію app/icon.png тощо) за розширенням:
  // без цього middleware редіректив їх на /login разом з рештою сторінок,
  // тож лого й фавікон були б биті саме на самій /login (де сесії ще нема).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)"],
};
