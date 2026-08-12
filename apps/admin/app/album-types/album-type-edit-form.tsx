"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@otak/ui";

type AlbumType = { id: string; name: string; page_count: number | null; price: number | null; cost_price: number | null };

export function AlbumTypeEditForm({ albumType, onClose }: { albumType: AlbumType; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(albumType.name);
  const [pageCount, setPageCount] = useState(albumType.page_count ? String(albumType.page_count) : "");
  const [price, setPrice] = useState(albumType.price ? String(albumType.price) : "");
  const [costPrice, setCostPrice] = useState(albumType.cost_price ? String(albumType.cost_price) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    setSaving(true);
    const res = await fetch(`/api/album-types/${albumType.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name, pageCount: pageCount || null, price: price || null, costPrice: costPrice || null }),
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(data.error ?? "Не вдалося зберегти");
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <div className="mt-3 flex flex-col gap-2.5 rounded-[10px] border border-line bg-page p-3" onClick={(e) => e.stopPropagation()}>
      <div>
        <label className="mb-1 block text-[10.5px] font-semibold text-ink-soft">Назва</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-[8px] border border-line px-2 py-1.5 text-xs outline-none focus:border-purple"
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="mb-1 block text-[10px] text-ink-soft">Сторінок</label>
          <input
            type="number"
            min={1}
            value={pageCount}
            onChange={(e) => setPageCount(e.target.value)}
            className="w-full rounded-[8px] border border-line px-2 py-1.5 text-xs outline-none focus:border-purple"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] text-ink-soft">Вартість, ₴</label>
          <input
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-full rounded-[8px] border border-line px-2 py-1.5 text-xs outline-none focus:border-purple"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] text-ink-soft">Собівартість, ₴</label>
          <input
            type="number"
            min={0}
            value={costPrice}
            onChange={(e) => setCostPrice(e.target.value)}
            className="w-full rounded-[8px] border border-line px-2 py-1.5 text-xs outline-none focus:border-purple"
          />
        </div>
      </div>
      {error && <p className="text-[11px] font-semibold text-warn">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" className="w-auto" onClick={handleSave} disabled={!name.trim() || saving}>
          {saving ? "Зберігаємо…" : "Зберегти"}
        </Button>
        <Button size="sm" variant="ghost" className="w-auto" onClick={onClose}>
          Скасувати
        </Button>
      </div>
    </div>
  );
}
