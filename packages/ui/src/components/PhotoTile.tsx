"use client";

import { useEffect, useRef, useState } from "react";

interface PhotoTileProps {
  filename: string;
  thumbnailUrl?: string;
  isFavorite?: boolean;
  isSelected?: boolean;
  onToggleFavorite?: () => void;
  onToggleSelect?: () => void;
  onOpen?: () => void;
  /** Посилання на завантаження оригіналу — кнопка ⤓ у кутку плитки. */
  downloadHref?: string;
}

/** Плитка фото в галереї: прев'ю, тег JPEG (або позначка вибору), сердечко "обране", кнопка завантаження. */
export function PhotoTile({
  filename,
  thumbnailUrl,
  isFavorite,
  isSelected,
  onToggleFavorite,
  onToggleSelect,
  onOpen,
  downloadHref,
}: PhotoTileProps) {
  // Ліниве завантаження: фон-картинку ставимо, лише коли плитка за ~1,5 екрана
  // від видимої області — сотні фото не тягнуться одночасно при відкритті галереї.
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "150% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  return (
    <div
      ref={ref}
      onClick={onOpen}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      className="relative aspect-[4/5] cursor-pointer select-none overflow-hidden rounded-[11px] border border-line bg-gradient-to-br from-purple-pale to-purple-soft [-webkit-touch-callout:none]"
      style={visible && thumbnailUrl ? { backgroundImage: `url(${thumbnailUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
    >
      {onToggleSelect ? (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
          aria-label={isSelected ? "Зняти вибір" : "Вибрати фото"}
          className={`absolute left-[7px] top-[7px] flex h-[24px] w-[24px] items-center justify-center rounded-full border-2 border-white shadow-[0_1px_3px_rgba(0,0,0,0.45)] ${
            isSelected ? "bg-purple" : "bg-black/30"
          }`}
        >
          {isSelected && (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          )}
        </button>
      ) : (
        <span className="absolute left-[7px] top-[7px] rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[9.5px] text-white">
          JPEG
        </span>
      )}
      {isSelected && <div className="pointer-events-none absolute inset-0 rounded-[11px] ring-[3px] ring-inset ring-purple" />}
      {onToggleFavorite && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
          aria-label={isFavorite ? "Прибрати з обраного" : "Додати в обране"}
          className="absolute right-[6px] top-[6px] flex h-[27px] w-[27px] items-center justify-center transition-transform hover:scale-110"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)]">
            <path
              d="M12 21s-6.7-4.35-9.3-8.1C1 10.1 1.6 6.9 4.2 5.3c2.2-1.4 4.9-.8 6.4 1.1.5.6 1 .6 1.5 0 1.5-1.9 4.2-2.5 6.4-1.1 2.6 1.6 3.2 4.8 1.5 7.6C18.7 16.65 12 21 12 21z"
              fill={isFavorite ? "#460464" : "rgba(255,255,255,0.18)"}
              stroke="#fff"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
      {downloadHref && (
        <a
          href={downloadHref}
          download
          onClick={(e) => e.stopPropagation()}
          aria-label="Завантажити фото"
          title="Завантажити JPEG"
          className="absolute bottom-[6px] right-[6px] z-10 flex h-[28px] w-[28px] items-center justify-center rounded-full bg-black/45 text-white transition-colors hover:bg-black/70"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" />
          </svg>
        </a>
      )}
      <div className={`absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/55 to-transparent pb-[6px] pl-[7px] pt-[14px] font-mono text-[10px] text-white ${downloadHref ? "pr-[40px]" : "pr-[7px]"}`}>
        {filename}
      </div>
    </div>
  );
}
