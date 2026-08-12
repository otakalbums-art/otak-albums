"use client";

interface PhotoTileProps {
  filename: string;
  thumbnailUrl?: string;
  isFavorite?: boolean;
  isSelected?: boolean;
  onToggleFavorite?: () => void;
  onToggleSelect?: () => void;
  onOpen?: () => void;
}

/** Плитка фото в галереї: прев'ю, тег JPEG, сердечко "обране", чекбокс відбору для альбому. */
export function PhotoTile({
  filename,
  thumbnailUrl,
  isFavorite,
  isSelected,
  onToggleFavorite,
  onToggleSelect,
  onOpen,
}: PhotoTileProps) {
  return (
    <div
      onClick={onOpen}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      className="relative aspect-[4/5] cursor-pointer select-none overflow-hidden rounded-[11px] border border-line bg-gradient-to-br from-purple-pale to-purple-soft [-webkit-touch-callout:none]"
      style={thumbnailUrl ? { backgroundImage: `url(${thumbnailUrl})`, backgroundSize: "cover" } : undefined}
    >
      <span className="absolute left-[7px] top-[7px] rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[9.5px] text-white">
        JPEG
      </span>
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
      {onToggleSelect && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
          aria-label={isSelected ? "Прибрати з відбору" : "Додати у відбір для альбому"}
          className={`absolute bottom-[7px] right-[7px] h-[19px] w-[19px] rounded-md border-[1.5px] border-white ${
            isSelected ? "bg-purple" : "bg-black/30"
          }`}
        />
      )}
      <div className="mt-auto w-full truncate bg-gradient-to-t from-black/55 to-transparent px-[7px] pb-[6px] pt-[14px] font-mono text-[10px] text-white">
        {filename}
      </div>
    </div>
  );
}
