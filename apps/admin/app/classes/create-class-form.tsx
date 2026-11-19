"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@otak/ui";
import { Baby, School } from "lucide-react";

type School = { id: string; name: string };
type AlbumType = { id: string; name: string; category: string | null };

/** Типи вже відсортовані сервером — групуємо за категорією в порядку першої появи. */
function groupByCategory(types: AlbumType[]): [string, AlbumType[]][] {
  const groups = new Map<string, AlbumType[]>();
  for (const t of types) {
    const key = t.category?.trim() || "Без категорії";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }
  return Array.from(groups.entries());
}

export function CreateClassForm({ schools, albumTypes }: { schools: School[]; albumTypes: AlbumType[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"school" | "kindergarten">("school");
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
        kind,
        schoolId: schoolId || undefined,
        newSchoolName: schoolId ? undefined : newSchoolName,
        albumTypeId: albumTypeId || undefined,
      }),
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(data.error ?? (isKg ? "Не вдалося створити групу" : "Не вдалося створити клас"));
      return;
    }

    setOpen(false);
    setName("");
    setNewSchoolName("");
    router.refresh();
  }

  const isKg = kind === "kindergarten";
  // Для групи садочка — лише садочкові типи альбомів (якщо такі є).
  const kgTypes = albumTypes.filter((t) => t.category?.toLowerCase().includes("садоч"));
  const visibleTypes = isKg && kgTypes.length ? kgTypes : albumTypes;

  if (!open) {
    return (
      <div className="mb-3 flex justify-end">
        <Button size="sm" className="w-auto" onClick={() => setOpen(true)}>
          + Створити клас або групу
        </Button>
      </div>
    );
  }

  return (
    <div className="mb-3.5 flex flex-col gap-2.5 rounded-[11px] border border-line p-3.5">
      <div className="inline-flex w-fit rounded-[10px] bg-page p-1">
        {(
          [
            ["school", "Клас школи", School],
            ["kindergarten", "Група садочка", Baby],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            onClick={() => {
              setKind(value);
              setAlbumTypeId("");
            }}
            className={`inline-flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[12px] font-semibold transition-colors ${
              kind === value ? "bg-card text-purple-deep shadow-sm" : "text-ink-soft hover:text-ink"
            }`}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>
      <div className="grid gap-2.5 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-ink-soft">{isKg ? "Назва групи" : "Назва класу"}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={isKg ? "Старша 1" : "11-А"}
            className="w-full rounded-[9px] border border-line px-2.5 py-1.5 text-xs outline-none focus:border-purple"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-ink-soft">{isKg ? "Садочок" : "Школа"}</label>
          <select
            value={schoolId}
            onChange={(e) => setSchoolId(e.target.value)}
            className="w-full rounded-[9px] border border-line px-2.5 py-1.5 text-xs outline-none focus:border-purple"
          >
            <option value="">{isKg ? "— Новий садочок —" : "— Нова школа —"}</option>
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
              placeholder={isKg ? "Назва нового садочка" : "Назва нової школи"}
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
            {groupByCategory(visibleTypes).map(([category, types]) => (
              <optgroup key={category} label={category}>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
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
