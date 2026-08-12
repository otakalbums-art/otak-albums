"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@otak/ui";

const COUNT_FIELDS: { key: string; label: string }[] = [
  { key: "portraitCount", label: "Портрети" },
  { key: "studioCount", label: "Фото зі студії" },
  { key: "schoolCount", label: "Шкільні фото" },
  { key: "outsideSchoolCount", label: "Фото поза школою" },
];

type CustomGroup = { label: string; count: string };

export function AlbumTypeCreateForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pageCount, setPageCount] = useState("");
  const [price, setPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [customGroups, setCustomGroups] = useState<CustomGroup[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addCustomGroup() {
    setCustomGroups((prev) => [...prev, { label: "", count: "" }]);
  }
  function updateCustomGroup(i: number, patch: Partial<CustomGroup>) {
    setCustomGroups((prev) => prev.map((g, idx) => (idx === i ? { ...g, ...patch } : g)));
  }
  function removeCustomGroup(i: number) {
    setCustomGroups((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleCreate() {
    setError(null);
    setSaving(true);
    const res = await fetch("/api/album-types", {
      method: "POST",
      body: JSON.stringify({
        name,
        pageCount: pageCount || undefined,
        price: price || undefined,
        costPrice: costPrice || undefined,
        ...Object.fromEntries(COUNT_FIELDS.map((f) => [f.key, counts[f.key] || undefined])),
        customGroups: customGroups
          .filter((g) => g.label.trim() && Number(g.count) > 0)
          .map((g) => ({ label: g.label.trim(), count: Number(g.count) })),
      }),
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(data.error ?? "Не вдалося створити тип альбому");
      return;
    }

    setOpen(false);
    setName("");
    setPageCount("");
    setPrice("");
    setCostPrice("");
    setCounts({});
    setCustomGroups([]);
    router.refresh();
  }

  if (!open) {
    return (
      <div className="mb-3 flex justify-end">
        <Button size="sm" className="w-auto" onClick={() => setOpen(true)}>
          + Новий тип альбому
        </Button>
      </div>
    );
  }

  return (
    <div className="mb-3.5 flex flex-col gap-3 rounded-[11px] border border-line p-3.5">
      <div className="grid gap-2.5 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-ink-soft">Назва</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Стандарт"
            className="w-full rounded-[9px] border border-line px-2.5 py-1.5 text-xs outline-none focus:border-purple"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-ink-soft">Кількість сторінок (необов'язково)</label>
          <input
            type="number"
            min={1}
            value={pageCount}
            onChange={(e) => setPageCount(e.target.value)}
            placeholder="20"
            className="w-full rounded-[9px] border border-line px-2.5 py-1.5 text-xs outline-none focus:border-purple"
          />
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-[11px] font-semibold text-ink-soft">
          Скільки фото в кожній групі — система сама створить слоти CRM (0 = не додавати)
        </div>
        <div className="grid gap-2.5 sm:grid-cols-4">
          {COUNT_FIELDS.map((f) => (
            <div key={f.key}>
              <label className="mb-1 block text-[10.5px] text-ink-soft">{f.label}</label>
              <input
                type="number"
                min={0}
                value={counts[f.key] ?? ""}
                onChange={(e) => setCounts((prev) => ({ ...prev, [f.key]: e.target.value }))}
                placeholder="0"
                className="w-full rounded-[9px] border border-line px-2.5 py-1.5 text-xs outline-none focus:border-purple"
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-[11px] font-semibold text-ink-soft">Свої групи (необов'язково)</div>
        <div className="flex flex-col gap-2">
          {customGroups.map((g, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={g.label}
                onChange={(e) => updateCustomGroup(i, { label: e.target.value })}
                placeholder="Напр. У парку"
                className="flex-1 rounded-[9px] border border-line px-2.5 py-1.5 text-xs outline-none focus:border-purple"
              />
              <input
                type="number"
                min={1}
                value={g.count}
                onChange={(e) => updateCustomGroup(i, { count: e.target.value })}
                placeholder="Кількість"
                className="w-[110px] rounded-[9px] border border-line px-2.5 py-1.5 text-xs outline-none focus:border-purple"
              />
              <button onClick={() => removeCustomGroup(i)} aria-label="Прибрати групу" className="text-ink-soft hover:text-warn">
                ✕
              </button>
            </div>
          ))}
          <Button size="sm" variant="ghost" className="w-auto" onClick={addCustomGroup}>
            + Додати групу
          </Button>
        </div>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-ink-soft">Вартість за екземпляр, ₴ (необов'язково)</label>
          <input
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="450"
            className="w-full rounded-[9px] border border-line px-2.5 py-1.5 text-xs outline-none focus:border-purple"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-ink-soft">Собівартість за екземпляр, ₴ (необов'язково)</label>
          <input
            type="number"
            min={0}
            value={costPrice}
            onChange={(e) => setCostPrice(e.target.value)}
            placeholder="250"
            className="w-full rounded-[9px] border border-line px-2.5 py-1.5 text-xs outline-none focus:border-purple"
          />
        </div>
      </div>

      {error && <p className="text-xs font-semibold text-warn">{error}</p>}

      <div className="flex gap-2">
        <Button size="sm" className="w-auto" onClick={handleCreate} disabled={!name.trim() || saving}>
          {saving ? "Створюємо…" : "Створити"}
        </Button>
        <Button size="sm" variant="ghost" className="w-auto" onClick={() => setOpen(false)}>
          Скасувати
        </Button>
      </div>
    </div>
  );
}
