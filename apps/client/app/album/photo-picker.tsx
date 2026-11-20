"use client";

import { useState } from "react";
import { Button } from "@otak/ui";
import { Check, Heart } from "lucide-react";

type Photo = { id: string; filename: string; url: string | null };
type Tab = "favorites" | "all";

/**
 * Модалка вибору фото для слота альбому. Дві вкладки: «Обране» (сердечка
 * учня, вже завантажені на сторінці) і «Усі фото» (уся галерея класу —
 * завантажується батьківською сторінкою при першому відкритті, allPhotos =
 * null, поки вантажиться). Вибір спільний для обох вкладок.
 */
export function PhotoPicker({
  slotLabel,
  maxPhotos,
  favorites,
  allPhotos,
  initialPhotoIds,
  onSave,
  onClose,
}: {
  slotLabel: string;
  maxPhotos: number;
  favorites: Photo[];
  allPhotos: Photo[] | null;
  initialPhotoIds: string[];
  onSave: (photoIds: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(initialPhotoIds);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(favorites.length > 0 ? "favorites" : "all");

  function toggle(photoId: string) {
    setSelected((prev) => {
      if (prev.includes(photoId)) return prev.filter((id) => id !== photoId);
      if (prev.length >= maxPhotos) return maxPhotos === 1 ? [photoId] : prev;
      return [...prev, photoId];
    });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await onSave(selected);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося зберегти");
    }
    setSaving(false);
  }

  const favoriteIds = new Set(favorites.map((p) => p.id));
  const list = tab === "favorites" ? favorites : allPhotos;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-[720px] flex-col rounded-2xl border border-line bg-card p-4 shadow-card"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold">
            {slotLabel} — обери {maxPhotos === 1 ? "фото" : `до ${maxPhotos} фото`}
          </h3>
          <span className="shrink-0 text-xs text-ink-soft">
            {selected.length}/{maxPhotos}
          </span>
        </div>

        <div className="mb-3 flex gap-[3px] self-start rounded-[9px] border border-line bg-page p-[3px]">
          <button
            onClick={() => setTab("favorites")}
            className={`inline-flex items-center gap-1 rounded-[6px] px-3.5 py-[7px] text-xs font-semibold ${
              tab === "favorites" ? "bg-purple-pale text-purple-deep" : "text-ink-soft"
            }`}
          >
            <Heart className="h-3.5 w-3.5" /> Обране ({favorites.length})
          </button>
          <button
            onClick={() => setTab("all")}
            className={`rounded-[6px] px-3.5 py-[7px] text-xs font-semibold ${
              tab === "all" ? "bg-purple-pale text-purple-deep" : "text-ink-soft"
            }`}
          >
            Усі фото{allPhotos ? ` (${allPhotos.length})` : ""}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {list === null ? (
            <p className="text-sm text-ink-soft">Завантажуємо фото…</p>
          ) : list.length === 0 ? (
            <p className="text-sm text-ink-soft">
              {tab === "favorites" ? (
                <>
                  Тут поки порожньо — познач фото сердечком{" "}
                  <Heart className="inline h-3 w-3 -translate-y-px fill-purple text-purple" /> в галереї або обери у
                  вкладці «Усі фото».
                </>
              ) : (
                "Фото ще не завантажені."
              )}
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
              {list.map((p) => {
                const isSelected = selected.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => toggle(p.id)}
                    onContextMenu={(e) => e.preventDefault()}
                    onDragStart={(e) => e.preventDefault()}
                    className={`relative aspect-[4/5] select-none overflow-hidden rounded-[9px] border-2 bg-gradient-to-br from-purple-pale to-purple-soft transition-colors [-webkit-touch-callout:none] ${
                      isSelected ? "border-purple" : "border-transparent hover:border-purple-soft"
                    }`}
                  >
                    {p.url && (
                      // Ліниве завантаження — у «Усіх фото» можуть бути сотні кадрів.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.url}
                        alt=""
                        loading="lazy"
                        draggable={false}
                        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                      />
                    )}
                    {tab === "all" && favoriteIds.has(p.id) && (
                      <Heart className="absolute left-1.5 top-1.5 h-4 w-4 fill-purple text-white drop-shadow" />
                    )}
                    {isSelected && (
                      <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-purple text-[11px] font-bold text-white">
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                    )}
                    <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 to-transparent px-1.5 pb-1 pt-3 text-left font-mono text-[9px] text-white">
                      {p.filename}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {error && <p className="mt-2 text-xs text-warn">{error}</p>}
        <div className="mt-3 flex justify-end gap-2">
          <Button size="sm" variant="ghost" className="w-auto" onClick={onClose} disabled={saving}>
            Скасувати
          </Button>
          <Button size="sm" className="w-auto" onClick={handleSave} disabled={saving}>
            {saving ? "Зберігаємо…" : "Зберегти"}
          </Button>
        </div>
      </div>
    </div>
  );
}
