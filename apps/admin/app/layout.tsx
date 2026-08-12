import type { Metadata } from "next";
import "./globals.css";
import { LogoutButton } from "./logout-button";
import { createSupabaseServerClient } from "@otak/supabase/server";
import { ADMIN_TABS } from "@/lib/admin-tabs";

export const metadata: Metadata = {
  title: "Otak Albums — адмін-панель",
  description: "Керування класами, типами альбомів, посиланнями для мам і бекап-сервером.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Без сесії — це /login (middleware.ts усе інше вже редіректить туди) —
  // рендеримо лише шапку з лого, без бічного меню (нема кого фільтрувати).
  let nav: { href: string; label: string }[] = [];
  let roleName: string | null = null;
  if (user) {
    const { data: admin } = await supabase
      .from("admin_users")
      .select("admin_roles(name, is_owner, tab_keys)")
      .eq("id", user.id)
      .maybeSingle();
    const role = (admin as any)?.admin_roles as { name: string; is_owner: boolean; tab_keys: string[] } | undefined;
    roleName = role?.name ?? null;
    const isOwner = !!role?.is_owner;
    const granted = role?.tab_keys ?? [];
    nav = ADMIN_TABS.filter((t) => isOwner || granted.includes(t.key));
    if (isOwner) nav = [...nav, { href: "/users", label: "Користувачі та ролі" }];
  }

  return (
    <html lang="uk">
      <body className="overflow-x-hidden font-sans text-ink antialiased">
        <div className="max-w-[1800px] px-[22px] py-6">
          <header className="mb-5 flex items-center gap-[11px]">
            {/* eslint-disable-next-line @next/next/no-img-element -- маленьке
                статичне лого, next/image не використовується більше ніде в
                застосунку, файл лежить у public/logo.png */}
            <img src="/logo.png" alt="Otak Albums" className="h-[52px] w-[52px] flex-shrink-0 rounded-full object-cover" />
            <div>
              <div className="text-[17px] font-bold">Otak Albums</div>
              <div className="text-xs text-ink-soft">Адмін-панель</div>
            </div>
          </header>
          {user ? (
            <div className="grid gap-[18px] md:grid-cols-[200px_1fr]">
              <nav className="h-fit rounded-2xl border border-line bg-card p-2.5 shadow-card">
                <div className="mb-2 hidden px-2 text-[10.5px] font-bold uppercase tracking-wider text-ink-soft md:block">
                  Керування
                </div>
                {/* Мобільно — горизонтальна стрічка з прокруткою (меню з 7 пунктів
                    не має займати весь екран над контентом); від md — звичний
                    вертикальний список. */}
                <div className="-mx-2.5 flex gap-1.5 overflow-x-auto px-2.5 pb-0.5 md:mx-0 md:flex-col md:gap-0 md:overflow-visible md:px-0 md:pb-0">
                  {nav.map((item) => (
                    <a
                      key={item.href}
                      href={item.href}
                      className="flex-shrink-0 whitespace-nowrap rounded-full border border-line bg-page px-3 py-2 text-[12.5px] font-semibold text-ink hover:border-purple-soft md:block md:flex-shrink md:whitespace-normal md:rounded-lg md:border-0 md:bg-transparent md:px-2.5 md:py-2.5 md:text-[13px] md:hover:bg-page"
                    >
                      {item.label}
                    </a>
                  ))}
                </div>
                <div className="my-1.5 hidden border-t border-line md:block" />
                {roleName && (
                  <div className="hidden px-2.5 pb-1 text-[10.5px] text-ink-soft md:block">Роль: {roleName}</div>
                )}
                <div className="mt-1.5 md:mt-0">
                  <LogoutButton />
                </div>
              </nav>
              <main className="min-w-0">{children}</main>
            </div>
          ) : (
            children
          )}
        </div>
      </body>
    </html>
  );
}
