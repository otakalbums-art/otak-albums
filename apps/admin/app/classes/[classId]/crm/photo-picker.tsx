"use client";

import { useEffect, useState } from "react";
import { Button } from "@otak/ui";

type Photo = { id: string; filename: string; url: string | null };
type ClassPhoto = Photo & { file_kind: "jpeg" | "raw" };
type Tab = "selected" | "favorites" | "all";

const TAB_LABEL: Record<Tab, string> = { selected: "Відібрані", favorites: "Обране", all: "Усі фото класу" };

/**
 * Модалка вибору фото для CRM-слоту — 3 джерела:
 *  - "Відібрані" й "Обране" — apps/admin/api/students/[studentId]/photo-picks
 *    (student_slot_photos учня / його favorites відповідно);
 *  - "Усі фото класу" — вже наявний /api/classes/[classId]/photos (лише JPEG).
 * Дефолтна вкладка — перша непорожня з ["Відібрані", "Обране", "Усі"].
 */
export function PhotoPicker({
  classId,
  studentId,
  slotLabel,
  maxPhotos,
  initialPhotoIds,
  onSave,
  onClose,
}: {
  classId: string;
  studentId: string;
  slotLabel: string;
  maxPhotos: number;
  initialPhotoIds: string[];
  onSave: (photoIds: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const [allPhotos, setAllPhotos] = useState<ClassPhoto[] | null>(null);
  const [favorites, setFavorites] = useState<Photo[] | null>(null);
  const [selectedPhotos, setSelectedPhotos] = useState<Photo[] | null>(null);
  const [tab, setTab] = useState<Tab | null>(null);
  const [selected, setSelected] = useState<string[]>(initialPhotoIds);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/classes/${classId}/photos`)
      .then((r) => r.json())
      .then((data) => setAllPhotos((data.photos ?? []).filter((p: ClassPhoto) => p.file_kind === "jpeg")));
    fetch(`/api/students/${studentId}/photo-picks`)
      .then((r) => r.json())
      .then((data) => {
        setFavorites(data.favorites ?? []);
        setSelectedPhotos(data.selected ?? []);
      });
  }, [classId, studentId]);

  // Дефолтна вкладка — щойно дані підʼїхали, обираємо першу непорожню.
  useEffect(() => {
    if (tab !== null || favorites === null || selectedPhotos === null) return;
    if (selectedPhotos.length > 0) setTab("selected");
    else if (favorites.length > 0) setTab("favorites");
    else setTab("all");
  }, [tab, favorites, selectedPhotos]);

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

  const photosForTab: Photo[] | null =
    tab === "selected" ? selectedPhotos : tab === "favorites" ? favorites : tab === "all" ? allPhotos : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-[720px] flex-col rounded-2xl border border-line bg-card p-4 shadow-card"
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold">
            {slotLabel} — обери {maxPhotos === 1 ? "фото" : `до ${maxPhotos} фото`}
          </h3>
          <span className="text-xs text-ink-soft">
            {selected.length}/{maxPhotos}
          </span>
        </div>

        <div className="mb-3 flex gap-[3px] rounded-[9px] border border-line bg-page p-[3px]">
          {(["selected", "favorites", "all"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-[6px] px-3 py-[7px] text-xs font-semibold ${
                tab === t ? "bg-purple-pale text-purple-deep" : "text-ink-soft"
              }`}
            >
              {TAB_LABEL[t]}
              {t === "selected" && selectedPhotos ? ` (${selectedPhotos.length})` : ""}
              {t === "favorites" && favorites ? ` (${favorites.length})` : ""}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {photosForTab === null ? (
            <p className="text-sm text-ink-soft">Завантажуємо…</p>
          ) : photosForTab.length === 0 ? (
            <p className="text-sm text-ink-soft">
              {tab === "selected" && "У цього учня ще немає жодного відібраного фото в жодному слоті."}
              {tab === "favorites" && "Учень ще не позначив жодного фото зіркою."}
              {tab === "all" && "У класі ще немає завантажених JPEG-фото."}
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
              {photosForTab.map((p) => {
                const isSelected = selected.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => toggle(p.id)}
                    className={`relative aspect-[4/5] overflow-hidden rounded-[9px] border-2 bg-cover bg-center transition-colors ${
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
