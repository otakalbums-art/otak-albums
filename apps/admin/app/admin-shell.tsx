"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  Camera,
  ClipboardList,
  HardDrive,
  LayoutDashboard,
  Link2,
  Menu,
  Notebook,
  School,
  UserCog,
  X,
  type LucideIcon,
} from "lucide-react";
import { LogoutButton } from "./logout-button";
import { NotificationsToggle } from "./notifications-toggle";
import { InstallAppButton } from "./install-app-button";

type NavItem = { href: string; label: string };

const ICONS: Record<string, LucideIcon> = {
  "/": LayoutDashboard,
  "/classes": School,
  "/crm": ClipboardList,
  "/ftp-import": Camera,
  "/album-types": Notebook,
  "/mom-links": Link2,
  "/backup": HardDrive,
  "/users": UserCog,
};

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({ nav, pathname, onNavigate }: { nav: NavItem[]; pathname: string; onNavigate?: () => void }) {
  return (
    <>
      {nav.map((item) => {
        const Icon = ICONS[item.href] ?? LayoutDashboard;
        const active = isActive(pathname, item.href);
        return (
          <a
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-[14px] font-semibold md:text-[13px] ${
              active ? "bg-purple-pale text-purple-deep" : "text-ink hover:bg-page"
            }`}
          >
            <Icon className={`h-[18px] w-[18px] flex-shrink-0 md:h-4 md:w-4 ${active ? "text-purple" : "text-ink-soft"}`} />
            {item.label}
          </a>
        );
      })}
    </>
  );
}

/**
 * Каркас адмінки. Комп'ютер (md+): бічне меню зліва, як раніше.
 * Телефон: закріплена верхня панель (лого, назва розділу, ☰) і висувне
 * меню-«сендвіч» — контент займає весь екран.
 */
export function AdminShell({ nav, roleName, children }: { nav: NavItem[]; roleName: string | null; children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const current = nav.find((n) => isActive(pathname, n.href))?.label ?? "Адмін-панель";

  // Закриваємо меню при переході й блокуємо прокрутку сторінки під ним.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const extras = (
    <>
      <div className="my-1.5 border-t border-line" />
      {roleName && <div className="px-2.5 pb-1 text-[11px] text-ink-soft">Роль: {roleName}</div>}
      <NotificationsToggle />
      <InstallAppButton />
      <LogoutButton />
    </>
  );

  return (
    <>
      {/* Телефон: верхня панель */}
      <header className="sticky top-0 z-40 -mx-3 mb-3 flex items-center gap-2.5 border-b border-line bg-page/95 px-3 py-2 backdrop-blur md:hidden">
        <button
          onClick={() => setOpen(true)}
          aria-label="Меню"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-card text-ink"
        >
          <Menu className="h-5 w-5" />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" className="h-8 w-8 rounded-full object-cover" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-bold leading-tight">{current}</div>
          <div className="text-[10.5px] leading-tight text-ink-soft">OA Admin</div>
        </div>
      </header>

      {/* Телефон: висувне меню */}
      <div className={`fixed inset-0 z-50 md:hidden ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
        <div
          onClick={() => setOpen(false)}
          className={`absolute inset-0 bg-black/40 transition-opacity ${open ? "opacity-100" : "opacity-0"}`}
        />
        <aside
          className={`absolute inset-y-0 left-0 flex w-[82%] max-w-[320px] flex-col overflow-y-auto bg-card p-3 shadow-2xl transition-transform duration-200 ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="mb-3 flex items-center gap-2.5 px-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Otak Albums" className="h-10 w-10 rounded-full object-cover" />
            <div className="flex-1">
              <div className="text-[15px] font-bold">Otak Albums</div>
              <div className="text-[11px] text-ink-soft">Адмін-панель</div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Закрити меню" className="p-2 text-ink-soft">
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className="flex flex-col gap-0.5">
            <NavLinks nav={nav} pathname={pathname} onNavigate={() => setOpen(false)} />
          </nav>
          {extras}
        </aside>
      </div>

      {/* Комп'ютер: шапка з лого + бічне меню */}
      <div className="hidden md:block">
        <div className="mb-5 flex items-center gap-[11px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Otak Albums" className="h-[52px] w-[52px] flex-shrink-0 rounded-full object-cover" />
          <div>
            <div className="text-[17px] font-bold">Otak Albums</div>
            <div className="text-xs text-ink-soft">Адмін-панель</div>
          </div>
        </div>
      </div>
      <div className="grid gap-[18px] md:grid-cols-[210px_1fr]">
        <nav className="hidden h-fit rounded-2xl border border-line bg-card p-2.5 shadow-card md:block">
          <div className="mb-2 px-2 text-[10.5px] font-bold uppercase tracking-wider text-ink-soft">Керування</div>
          <NavLinks nav={nav} pathname={pathname} />
          {extras}
        </nav>
        <main className="min-w-0">{children}</main>
      </div>
    </>
  );
}
