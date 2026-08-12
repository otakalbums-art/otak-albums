import type { Metadata } from "next";
import "./globals.css";
import { SiteNav } from "./site-nav";

export const metadata: Metadata = {
  title: "Otak Albums — платформа для випускних фотозйомок",
  description: "Клієнтський сайт для учнів: галерея, обране, відбір фото для альбому.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uk">
      <body className="font-sans text-ink antialiased">
        <div className="mx-auto max-w-[1240px] px-[22px] py-6">
          <header className="mb-5 flex items-center gap-[11px]">
            {/* eslint-disable-next-line @next/next/no-img-element -- маленьке
                статичне лого, той самий файл і ті самі пропорції, що й у
                адмінці (apps/admin/app/layout.tsx) */}
            <img src="/logo.png" alt="Otak Albums" className="h-[52px] w-[52px] flex-shrink-0 rounded-full object-cover" />
            <div>
              <div className="text-[17px] font-bold">Otak Albums</div>
              <div className="text-xs text-ink-soft">Платформа для випускних фотозйомок</div>
            </div>
          </header>
          <SiteNav />
          {children}
        </div>
      </body>
    </html>
  );
}
