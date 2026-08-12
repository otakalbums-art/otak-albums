"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@otak/ui";

type Slot = {
  id: string;
  label: string;
  kind: "photo" | "text";
  max_photos: number;
  filled_by: "admin" | "student";
  sort_order: number;
};

const KIND_LABEL: Record<Slot["kind"], string> = { photo: "📷 Фото", text: "📝 Текст" };
const FILLED_BY_LABEL: Record<Slot["filled_by"], string> = { admin: "адмін", student: "учень" };

export function SlotsEditor({ albumTypeId, initialSlots }: { albumTypeId: string; initialSlots: Slot[] }) {
  const router = useRouter();
  const [busySlotId, setBusySlotId] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<Slot["kind"]>("photo");
  const [maxPhotos, setMaxPhotos] = useState(1);
  const [filledBy, setFilledBy] = useState<Slot["filled_by"]>("admin");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setError(null);
    setSaving(true);
    const res = await fetch(`/api/album-types/${albumTypeId}/slots`, {
      method: "POST",
      body: JSON.stringify({
        label,
        kind,
        maxPhotos: kind === "photo" ? maxPhotos : undefined,
        filledBy: kind === "text" ? filledBy : undefined,
      }),
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(data.error ?? "Не вдалося створити слот");
      return;
    }

    setOpen(false);
    setLabel("");
    setKind("photo");
    setMaxPhotos(1);
    setFilledBy("admin");
    router.refresh();
  }

  async function handleDelete(slotId: string, slotLabel: string) {
    if (!confirm(`Видалити слот "${slotLabel}"? Усі проставлені фото/відповіді учнів для нього теж зникнуть.`)) return;
    setBusySlotId(slotId);
    await fetch(`/api/album-types/${albumTypeId}/slots/${slotId}`, { method: "DELETE" });
    setBusySlotId(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {initialSlots.length === 0 ? (
        <p className="text-sm text-ink-soft">Слотів ще немає — додай перший нижче.</p>
      ) : (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b-[1.5px] border-line text-left text-[11px] font-bold text-ink-soft">
              <th className="py-2">Підпис</th>
              <th>Тип</th>
              <th>Деталі</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {initialSlots.map((s) => (
              <tr key={s.id} className="border-b border-line">
                <td className="py-2.5 font-semibold">{s.label}</td>
                <td>{KIND_LABEL[s.kind]}</td>
                <td className="text-ink-soft">
                  {s.kind === "photo" ? `до ${s.max_photos} фото` : `заповнює: ${FILLED_BY_LABEL[s.filled_by]}`}
                </td>
                <td>
                  <button
                    onClick={() => handleDelete(s.id, s.label)}
                    disabled={busySlotId === s.id}
                    className="text-[12px] font-semibold text-warn hover:underline disabled:opacity-50"
                  >
                    Видалити
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!open ? (
        <div className="flex justify-end">
          <Button size="sm" className="w-auto" onClick={() => setOpen(true)}>
            + Додати слот
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 rounded-[11px] border border-line p-3.5">
          <div className="grid gap-2.5 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-ink-soft">Підпис</label>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Портрет 1"
                className="w-full rounded-[9px] border border-line px-2.5 py-1.5 text-xs outline-none focus:border-purple"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-ink-soft">Тип</label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as Slot["kind"])}
                className="w-full rounded-[9px] border border-line px-2.5 py-1.5 text-xs outline-none focus:border-purple"
              >
                <option value="photo">📷 Фото</option>
                <option value="text">📝 Текст</option>
              </select>
            </div>
            {kind === "photo" ? (
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-ink-soft">Макс. фото в слоті</label>
                <input
                  type="number"
                  min={1}
                  value={maxPhotos}
                  onChange={(e) => setMaxPhotos(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full rounded-[9px] border border-line px-2.5 py-1.5 text-xs outline-none focus:border-purple"
                />
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-ink-soft">Хто заповнює</label>
                <select
                  value={filledBy}
                  onChange={(e) => setFilledBy(e.target.value as Slot["filled_by"])}
                  className="w-full rounded-[9px] border border-line px-2.5 py-1.5 text-xs outline-none focus:border-purple"
                >
                  <option value="admin">Адмін (в CRM-таблиці)</option>
                  <option value="student">Учень (сам, на клієнтському сайті)</option>
                </select>
              </div>
            )}
          </div>

          {error && <p className="text-xs font-semibold text-warn">{error}</p>}

          <div className="flex gap-2">
            <Button size="sm" className="w-auto" onClick={handleCreate} disabled={!label.trim() || saving}>
              {saving ? "Додаємо…" : "Додати"}
            </Button>
            <Button size="sm" variant="ghost" className="w-auto" onClick={() => setOpen(false)}>
              Скасувати
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
