"use client";

import { useState } from "react";
import { Button } from "@otak/ui";

type Photo = { id: string; filename: string; url: string | null };

/**
 * Модалка вибору фото для слота альбому — на відміну від адмінського
 * пікера (apps/admin/.../crm/photo-picker.tsx), тут кандидати передаються
 * готовим списком (favorites учня, вже завантажені на сторінці), без
 * окремого fetch.
 */
export function PhotoPicker({
  slotLabel,
  maxPhotos,
  photos,
  initialPhotoIds,
  onSave,
  onClose,
}: {
  slotLabel: string;
  maxPhotos: number;
  photos: Photo[];
  initialPhotoIds: string[];
  onSave: (photoIds: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(initialPhotoIds);
  const [saving, setSaving] = useState(false);

  function toggle(photoId: string) {
    setSelected((prev) => {
      if (prev.includes(photoId)) return prev.filter((id) => id !== photoId);
      if (prev.length >= maxPhotos) return maxPhotos === 1 ? [photoId] : prev;
      return [...prev, photoId];
    });
  }

  async function handleSave() {
    setSaving(true);
    await onSave(selected);
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-[720px] flex-col rounded-2xl border border-line bg-card p-4 shadow-card"
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold">
            {slotLabel} — обери {maxPhotos === 1 ? "фото" : `до ${maxPhotos} фото`} з обраного
          </h3>
          <span className="text-xs text-ink-soft">
            {selected.length}/{maxPhotos}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {photos.length === 0 ? (
            <p className="text-sm text-ink-soft">
              Тут поки порожньо — спершу познач фото зіркою ★ в галереї, щоб вони з'явились тут.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
              {photos.map((p) => {
                const isSelected = selected.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => toggle(p.id)}
                    onContextMenu={(e) => e.preventDefault()}
                    onDragStart={(e) => e.preventDefault()}
                    className={`relative aspect-[4/5] select-none overflow-hidden rounded-[9px] border-2 bg-cover bg-center transition-colors [-webkit-touch-callout:none] ${
                      isSelected ? "border-purple" : "border-transparent hover:border-purple-soft"
                    }`}
                    style={p.url ? { backgroundImage: `url(${p.url})` } : undefined}
                  >
                    {isSelected && (
                      <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-purple text-[11px] font-bold text-white">
                        ✓
                      </span>
                    )}
                    <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 to-transparent px-1.5 pb-1 pt-3 font-mono text-[9px] text-white">
                      {p.filename}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

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
