import type { Metadata } from "next";
import "./globals.css";

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
            <div className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-purple text-[15px] font-extrabold text-white">
              O
            </div>
            <div>
              <div className="text-[17px] font-bold">Otak Albums</div>
              <div className="text-xs text-ink-soft">Платформа для випускних фотозйомок</div>
            </div>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
