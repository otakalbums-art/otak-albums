"use client";

import { useState } from "react";
import { Button } from "@otak/ui";
import { ADMIN_TABS, type TabKey } from "@/lib/admin-tabs";

type RoleFormValue = { name: string; tab_keys: string[] };

/**
 * Форма ролі — і для створення (collapsed "+ Нова роль" кнопкою, як
 * album-type-create-form.tsx), і для інлайн-редагування (передай `initial`
 * і `onCancel`, форма одразу відкрита, без збірної кнопки). Один компонент
 * на обидва випадки, бо форма — той самий набір полів (назва + чекбокси
 * ADMIN_TABS).
 */
export function RoleForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: RoleFormValue;
  onSave: (value: RoleFormValue) => Promise<string | void>; // повертає текст помилки, якщо не вдалось
  onCancel?: () => void;
}) {
  const isEdit = !!initial;
  const [open, setOpen] = useState(isEdit);
  const [name, setName] = useState(initial?.name ?? "");
  const [tabKeys, setTabKeys] = useState<string[]>(initial?.tab_keys ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleTab(key: TabKey) {
    setTabKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function handleSave() {
    setError(null);
    setSaving(true);
    const err = await onSave({ name: name.trim(), tab_keys: tabKeys });
    setSaving(false);
    if (err) {
      setError(err);
      return;
    }
    if (!isEdit) {
      setOpen(false);
      setName("");
      setTabKeys([]);
    }
  }

  if (!open) {
    return (
      <div className="mb-3 flex justify-end">
        <Button size="sm" className="w-auto" onClick={() => setOpen(true)}>
          + Нова роль
        </Button>
      </div>
    );
  }

  return (
    <div className="mb-3.5 flex flex-col gap-3 rounded-[11px] border border-line p-3.5">
      <div>
        <label className="mb-1 block text-[11px] font-semibold text-ink-soft">Назва ролі</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Напр. Помічник фотографа"
          className="w-full max-w-[320px] rounded-[9px] border border-line px-2.5 py-1.5 text-xs outline-none focus:border-purple"
        />
      </div>
      <div>
        <div className="mb-1.5 text-[11px] font-semibold text-ink-soft">Доступні вкладки</div>
        <div className="flex flex-wrap gap-2">
          {ADMIN_TABS.map((tab) => (
            <label
              key={tab.key}
              className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors ${
                tabKeys.includes(tab.key)
                  ? "border-purple bg-purple-pale text-purple-deep"
                  : "border-line text-ink-soft hover:border-purple-soft"
              }`}
            >
              <input
                type="checkbox"
                checked={tabKeys.includes(tab.key)}
                onChange={() => toggleTab(tab.key)}
                className="sr-only"
              />
              {tab.label}
            </label>
          ))}
        </div>
      </div>

      {error && <p className="text-xs font-semibold text-warn">{error}</p>}

      <div className="flex gap-2">
        <Button size="sm" className="w-auto" onClick={handleSave} disabled={!name.trim() || saving}>
          {saving ? "Зберігаємо…" : isEdit ? "Зберегти" : "Створити"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="w-auto"
          onClick={() => {
            if (isEdit) onCancel?.();
            else setOpen(false);
          }}
        >
          Скасувати
        </Button>
      </div>
    </div>
  );
}
