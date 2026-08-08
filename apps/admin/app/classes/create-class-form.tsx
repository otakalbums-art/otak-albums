"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@otak/ui";

type School = { id: string; name: string };
type AlbumType = { id: string; name: string };

export function CreateClassForm({ schools, albumTypes }: { schools: School[]; albumTypes: AlbumType[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [newSchoolName, setNewSchoolName] = useState("");
  const [albumTypeId, setAlbumTypeId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setError(null);
    setSaving(true);
    const res = await fetch("/api/classes", {
      method: "POST",
      body: JSON.stringify({
        name,
        schoolId: schoolId || undefined,
        newSchoolName: schoolId ? undefined : newSchoolName,
        albumTypeId: albumTypeId || undefined,
      }),
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(data.error ?? "Не вдалося створити клас");
      return;
    }

    setOpen(false);
    setName("");
    setNewSchoolName("");
    router.refresh();
  }

  if (!open) {
    return (
      <div className="mb-3 flex justify-end">
        <Button size="sm" className="w-auto" onClick={() => setOpen(true)}>
          + Створити папку класу
        </Button>
      </div>
    );
  }

  return (
    <div className="mb-3.5 flex flex-col gap-2.5 rounded-[11px] border border-line p-3.5">
      <div className="grid gap-2.5 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-ink-soft">Назва класу</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="11-А"
            className="w-full rounded-[9px] border border-line px-2.5 py-1.5 text-xs outline-none focus:border-purple"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-ink-soft">Школа</label>
          <select
            value={schoolId}
            onChange={(e) => setSchoolId(e.target.value)}
            className="w-full rounded-[9px] border border-line px-2.5 py-1.5 text-xs outline-none focus:border-purple"
          >
            <option value="">— Нова школа —</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {!schoolId && (
            <input
              value={newSchoolName}
              onChange={(e) => setNewSchoolName(e.target.value)}
              placeholder="Назва нової школи"
              className="mt-1.5 w-full rounded-[9px] border border-line px-2.5 py-1.5 text-xs outline-none focus:border-purple"
            />
          )}
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-ink-soft">Тип альбому</label>
          <select
            value={albumTypeId}
            onChange={(e) => setAlbumTypeId(e.target.value)}
            className="w-full rounded-[9px] border border-line px-2.5 py-1.5 text-xs outline-none focus:border-purple"
          >
            <option value="">— Без типу —</option>
            {albumTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
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
