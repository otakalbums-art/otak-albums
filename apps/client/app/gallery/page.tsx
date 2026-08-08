"use client";

import { useEffect, useState } from "react";
import { PhotoTile } from "@otak/ui";

type Photo = {
  id: string;
  filename: string;
  thumbnailUrl?: string;
  is_favorite: boolean;
  is_selected: boolean;
};

const POLL_MS = 4000;

/**
 * Галерея класу. Реалізовано:
 *  - сегментований фільтр Усі/Обране
 *  - періодичне опитування /api/photos, щоб нові фото зʼявлялись без
 *    ручного оновлення сторінки
 *  - лайк / відбір для альбому пряио на плитці
 *
 * Чому не Supabase Realtime (postgres_changes): RLS для anon-ролі
 * навмисно закритий (docs/auth-strategy.md) — учні ходять лише через
 * service_role-захищені route handlers, ніколи напряму до таблиць. Anon
 * ключ (той, що використовує браузерний клієнт) через це ніколи не
 * отримає жодної realtime-події на `photos`, скільки не вмикай publication
 * — RLS блокує доставку на рівні рядка. Опитування через /api/photos
 * обходить цю проблему, лишаючись у межах тієї самої моделі безпеки.
 */
export default function GalleryPage() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [filter, setFilter] = useState<"all" | "favorites">("all");
  const [isLive, setIsLive] = useState(false);

  function refetch() {
    return fetch("/api/photos")
      .then((r) => r.json())
      .then((data) => {
        setPhotos(data.photos ?? []);
        setIsLive(true);
      })
      .catch(() => {});
  }

  useEffect(() => {
    refetch();
    const id = setInterval(refetch, POLL_MS);
    return () => clearInterval(id);
  }, []);

  const visible = filter === "favorites" ? photos.filter((p) => p.is_favorite) : photos;

  async function toggleFavorite(photoId: string) {
    setPhotos((prev) => prev.map((p) => (p.id === photoId ? { ...p, is_favorite: !p.is_favorite } : p)));
    await fetch(`/api/photos/${photoId}/favorite`, { method: "POST" });
  }

  async function toggleSelect(photoId: string) {
    setPhotos((prev) => prev.map((p) => (p.id === photoId ? { ...p, is_selected: !p.is_selected } : p)));
    await fetch(`/api/photos/${photoId}/select`, { method: "POST" });
  }

  return (
    <div>
      <h1 className="mb-1 text-lg font-bold">11-А, ЗОШ №14</h1>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-[3px] rounded-[9px] border border-line bg-card p-[3px]">
          <button
            onClick={() => setFilter("all")}
            className={`rounded-[6px] px-3.5 py-[7px] text-xs font-semibold ${
              filter === "all" ? "bg-purple-pale text-purple-deep" : "text-ink-soft"
            }`}
          >
            Усі фото
          </button>
          <button
            onClick={() => setFilter("favorites")}
            className={`rounded-[6px] px-3.5 py-[7px] text-xs font-semibold ${
              filter === "favorites" ? "bg-purple-pale text-purple-deep" : "text-ink-soft"
            }`}
          >
            ★ Обране
          </button>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-bold ${
            isLive ? "bg-[#E7F7EE] text-ok" : "bg-line text-ink-soft"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${isLive ? "bg-ok" : "bg-ink-soft"}`} />
          {isLive ? "Оновлюється автоматично" : "Завантаження…"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {visible.map((photo) => (
          <PhotoTile
            key={photo.id}
            filename={photo.filename}
            thumbnailUrl={photo.thumbnailUrl}
            isFavorite={photo.is_favorite}
            isSelected={photo.is_selected}
            onToggleFavorite={() => toggleFavorite(photo.id)}
            onToggleSelect={() => toggleSelect(photo.id)}
          />
        ))}
      </div>

      {visible.length === 0 && (
        <p className="mt-6 text-center text-sm text-ink-soft">
          {filter === "favorites" ? "Ще немає обраних фото." : "Фото ще не завантажені."}
        </p>
      )}

      <p className="mt-4 text-xs text-ink-soft">
        Показані лише файли формату <b>.jpeg</b> — фільтрація за типом застосовується автоматично
        під час завантаження на сервер.
      </p>
    </div>
  );
}
