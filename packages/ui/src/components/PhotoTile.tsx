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

/** Плитка фото в галереї: прев'ю, тег JPEG, зірочка "обране", чекбокс відбору для альбому. */
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
      className="relative aspect-[4/5] cursor-pointer overflow-hidden rounded-[11px] border border-line bg-gradient-to-br from-purple-pale to-purple-soft"
      style={thumbnailUrl ? { backgroundImage: `url(${thumbnailUrl})`, backgroundSize: "cover" } : undefined}
    >
      <span className="absolute left-[7px] top-[7px] rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[9.5px] text-white">
        JPEG
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); onToggleFavorite?.(); }}
        className={`absolute right-[7px] top-[7px] flex h-[25px] w-[25px] items-center justify-center rounded-full text-xs ${
          isFavorite ? "bg-purple text-white" : "bg-white/92 text-ink"
        }`}
      >
        ★
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onToggleSelect?.(); }}
        className={`absolute bottom-[7px] right-[7px] h-[19px] w-[19px] rounded-md border-[1.5px] border-white ${
          isSelected ? "bg-purple" : "bg-black/30"
        }`}
      />
      <div className="mt-auto w-full truncate bg-gradient-to-t from-black/55 to-transparent px-[7px] pb-[6px] pt-[14px] font-mono text-[10px] text-white">
        {filename}
      </div>
    </div>
  );
}
