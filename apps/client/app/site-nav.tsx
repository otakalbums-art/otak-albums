"use client";

import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/gallery", label: "Галерея" },
  { href: "/album", label: "Сформувати альбом" },
  { href: "/profile", label: "Мій профіль" },
];

/**
 * Постійна навігація між розділами учнівського сайту — до цього єдиним
 * способом перейти між галереєю/альбомом/профілем були розкидані по
 * сторінках посилання (напр. лише з галереї на решту, а назад — ніяк),
 * і кнопка "Назад" браузера була фактично єдиним шляхом. Ховається на
 * /login* (там ще немає сесії, нема куди вести) — умова на pathname, бо
 * root layout.tsx серверний і не знає стан авторизації напряму.
 */
export function SiteNav() {
  const pathname = usePathname();
  if (pathname.startsWith("/login")) return null;

  return (
    <nav className="mb-5 flex flex-wrap gap-1.5 border-b border-line pb-3.5">
      {LINKS.map((l) => (
        <a
          key={l.href}
          href={l.href}
          className={`rounded-full px-3.5 py-2 text-[12.5px] font-semibold transition-colors ${
            pathname === l.href ? "bg-purple-pale text-purple-deep" : "text-ink-soft hover:bg-page"
          }`}
        >
          {l.label}
        </a>
      ))}
    </nav>
  );
}
