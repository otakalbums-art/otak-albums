import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AdminShell } from "./admin-shell";
import { createSupabaseServerClient } from "@otak/supabase/server";
import { ADMIN_TABS } from "@/lib/admin-tabs";
import { ensureSchedulerRunning } from "@/lib/push-scheduler";

export const metadata: Metadata = {
  title: "Otak Albums — адмін-панель",
  description: "Керування класами, типами альбомів, посиланнями для мам і бекап-сервером.",
  applicationName: "OA Admin",
  // iPhone: назва під іконкою на головному екрані й режим «як застосунок».
  appleWebApp: { capable: true, title: "OA Admin", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#460464",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  ensureSchedulerRunning(); // ідемпотентно — реально стартує лише один раз за життя сервера

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
        <div className="max-w-[1800px] px-3 pb-6 md:px-[22px] md:py-6">
          {user ? (
            <AdminShell nav={nav} roleName={roleName}>
              {children}
            </AdminShell>
          ) : (
            <>
              <header className="mb-5 mt-4 flex items-center gap-[11px] md:mt-0">
                {/* eslint-disable-next-line @next/next/no-img-element -- маленьке статичне лого з public/logo.png */}
                <img src="/logo.png" alt="Otak Albums" className="h-[52px] w-[52px] flex-shrink-0 rounded-full object-cover" />
                <div>
                  <div className="text-[17px] font-bold">Otak Albums</div>
                  <div className="text-xs text-ink-soft">Адмін-панель</div>
                </div>
              </header>
              {children}
            </>
          )}
        </div>
      </body>
    </html>
  );
}
