"use client";

import { useEffect, useState } from "react";
import { Card, Button, ProgressRing, PhotoTile } from "@otak/ui";

type Photo = { id: string; filename: string; is_selected: boolean };

/** Крок 2: з "Обраного" учень остаточно відзначає фото для друку в альбомі. */
export default function AlbumSelectionPage() {
  const [favorites, setFavorites] = useState<Photo[]>([]);
  const [confirmMessage, setConfirmMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/photos?favorites=1")
      .then((r) => r.json())
      .then((data) => setFavorites(data.photos ?? []))
      .catch(() => {});
  }, []);

  const selectedCount = favorites.filter((p) => p.is_selected).length;

  async function toggleSelect(photoId: string) {
    setFavorites((prev) => prev.map((p) => (p.id === photoId ? { ...p, is_selected: !p.is_selected } : p)));
    await fetch(`/api/photos/${photoId}/select`, { method: "POST" });
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="Крок 1 — Обране" period={`${favorites.length} фото позначено зіркою`}>
        <div className="grid grid-cols-3 gap-2">
          {favorites.map((p) => (
            <PhotoTile
              key={p.id}
              filename={p.filename}
              isFavorite
              isSelected={p.is_selected}
              onToggleSelect={() => toggleSelect(p.id)}
            />
          ))}
        </div>
      </Card>

      <Card title="Крок 2 — Для альбому" period="Клас 11-А · відбір триває">
        <ProgressRing selected={selectedCount} total={favorites.length || 1} />
        <Button
          className="mt-2"
          onClick={async () => {
            setConfirmMessage(null);
            const res = await fetch("/api/album-selection/confirm", { method: "POST" });
            const data = await res.json();
            setConfirmMessage(
              res.ok
                ? { type: "ok", text: `Відбір підтверджено: ${data.selectedCount} фото для альбому.` }
                : { type: "error", text: data.error ?? "Не вдалося підтвердити відбір." }
            );
          }}
        >
          Підтвердити відбір для альбому
        </Button>
        {confirmMessage && (
          <p className={`mt-2 text-xs font-semibold ${confirmMessage.type === "ok" ? "text-ok" : "text-warn"}`}>
            {confirmMessage.text}
          </p>
        )}
      </Card>
    </div>
  );
}
