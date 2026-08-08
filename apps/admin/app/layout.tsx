import type { Metadata } from "next";
import "./globals.css";
import { LogoutButton } from "./logout-button";

export const metadata: Metadata = {
  title: "Otak Albums — адмін-панель",
  description: "Керування класами, типами альбомів, посиланнями для мам і бекап-сервером.",
};

const NAV = [
  { href: "/", label: "Дашборд" },
  { href: "/classes", label: "Класи та папки" },
  { href: "/ftp-import", label: "Прийом з камер (Wi-Fi)" },
  { href: "/album-types", label: "Типи альбомів" },
  { href: "/mom-links", label: "Для мам" },
  { href: "/backup", label: "Бекап-сервер" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uk">
      <body className="font-sans text-ink antialiased">
        <div className="mx-auto max-w-[1240px] px-[22px] py-6">
          <header className="mb-5 flex items-center gap-[11px]">
            <div className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-purple text-[15px] font-extrabold text-white">
              O
            </div>
            <div>
              <div className="text-[17px] font-bold">Otak Albums</div>
              <div className="text-xs text-ink-soft">Адмін-панель</div>
            </div>
          </header>
          <div className="grid gap-[18px] md:grid-cols-[200px_1fr]">
            <nav className="h-fit rounded-2xl border border-line bg-card p-2.5 shadow-card">
              <div className="mb-2 px-2 text-[10.5px] font-bold uppercase tracking-wider text-ink-soft">
                Керування
              </div>
              {NAV.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="block rounded-lg px-2.5 py-2.5 text-[13px] font-semibold text-ink hover:bg-page"
                >
                  {item.label}
                </a>
              ))}
              <div className="my-1.5 border-t border-line" />
              <LogoutButton />
            </nav>
            <main>{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
