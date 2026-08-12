/**
 * Єдине джерело правди для вкладок бічного меню адмінки — використовується
 * (а) для рендеру самого меню (apps/admin/app/layout.tsx), (б) для
 * чекбоксів у редакторі ролі (apps/admin/app/users/role-form.tsx),
 * (в) для мапінгу шляху сторінки на ключ вкладки в middleware.ts, щоб
 * знати, чи дозволена вона поточній ролі.
 *
 * "users" (сторінка /users, "Користувачі та ролі") навмисно НЕ входить у
 * ADMIN_TABS — вона не є вкладкою, яку можна призначити ролі; доступ до
 * неї має лише admin_roles.is_owner (supabase/migrations/0009_admin_roles.sql).
 */
export const ADMIN_TABS = [
  { key: "dashboard", label: "Дашборд", href: "/" },
  { key: "classes", label: "Класи та папки", href: "/classes" },
  { key: "crm", label: "CRM", href: "/crm" },
  { key: "ftp", label: "Прийом з камер (Wi-Fi)", href: "/ftp-import" },
  { key: "album_types", label: "Типи альбомів", href: "/album-types" },
  { key: "mom_links", label: "Для мам", href: "/mom-links" },
  { key: "backup", label: "Бекап-сервер", href: "/backup" },
] as const;

export type TabKey = (typeof ADMIN_TABS)[number]["key"];

export const TAB_KEYS = ADMIN_TABS.map((t) => t.key) as TabKey[];

/**
 * Шлях сторінки -> ключ вкладки, для перевірки прав у middleware.
 * Порядок важливий: /classes/[id]/crm перевіряється ДО загального
 * префікса /classes, бо функціонально це частина CRM, не "Класи та папки"
 * (реально керується з crm-grid.tsx, а не з photos-gallery.tsx/upload-form.tsx).
 * /login і /no-access навмисно повертають null — доступні завжди.
 */
export function pathToTab(pathname: string): TabKey | "users" | null {
  if (pathname === "/") return "dashboard";
  if (/^\/classes\/[^/]+\/crm(\/|$)/.test(pathname)) return "crm";
  if (pathname.startsWith("/classes")) return "classes";
  if (pathname.startsWith("/crm")) return "crm";
  if (pathname.startsWith("/ftp-import")) return "ftp";
  if (pathname.startsWith("/album-types")) return "album_types";
  if (pathname.startsWith("/mom-links")) return "mom_links";
  if (pathname.startsWith("/backup")) return "backup";
  if (pathname.startsWith("/users")) return "users";
  return null;
}
