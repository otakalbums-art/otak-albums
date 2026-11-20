"use client";

import { useEffect, useState } from "react";
import { Toggle } from "@otak/ui";
import { ArrowDown, ArrowUp, EyeOff, Lock, Plus, Trash2 } from "lucide-react";
import { CategoryIcon } from "@/lib/photo-categories";

type Category = {
  key: string;
  label: string;
  sort_order: number;
  hidden_from_parents: boolean;
  is_system: boolean;
  photoCount: number;
};

const SYSTEM_HINT: Record<string, string> = {
  personal: "Фото для одного учня — при завантаженні обирається дитина",
  uncategorized: "Сюди переходять фото з видаленої категорії; камера без вказаної папки теж пише сюди",
};

/** Назва з олівцем: зберігається, коли поле втрачає фокус або натиснуто Enter. */
function LabelInput({ value, onSave }: { value: string; onSave: (next: string) => Promise<void> }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  async function commit() {
    const next = draft.trim();
    if (!next) return setDraft(value);
    if (next !== value) await onSave(next);
  }
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      maxLength={60}
      className="w-full min-w-0 rounded-[8px] border border-transparent bg-transparent px-2 py-1 text-[13.5px] font-semibold hover:border-line focus:border-purple focus:bg-white focus:outline-none"
    />
  );
}

export function CategoriesEditor() {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  async function refetch() {
    const res = await fetch("/api/photo-categories", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    setCategories(data.categories ?? []);
  }
  useEffect(() => {
    refetch();
  }, []);

  async function call(url: string, method: string, body?: unknown, ok?: string) {
    setBusy(true);
    setMessage(null);
    const res = await fetch(url, { method, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMessage({ type: "error", text: data.error ?? "Не вдалося зберегти" });
      return null;
    }
    if (ok) setMessage({ type: "ok", text: ok });
    await refetch();
    return data;
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const label = newLabel.trim();
    if (!label) return;
    const data = await call("/api/photo-categories", "POST", { label }, `Категорію «${label}» додано`);
    if (data) setNewLabel("");
  }

  async function move(index: number, delta: number) {
    if (!categories) return;
    const next = [...categories];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    setCategories(next);
    await call("/api/photo-categories", "PUT", { keys: next.map((c) => c.key) });
  }

  async function remove(c: Category) {
    const note = c.photoCount
      ? `\n\n${c.photoCount} фото з неї перейдуть у «Без категорії» (самі фото не видаляються).`
      : "";
    if (!confirm(`Видалити категорію «${c.label}»?${note}\n\nКамера, налаштована на папку /${c.key}, далі писатиме в «Без категорії».`)) return;
    const data = await call(`/api/photo-categories/${c.key}`, "DELETE");
    if (data) setMessage({ type: "ok", text: `Категорію видалено${data.moved ? `, ${data.moved} фото перенесено в «Без категорії»` : ""}` });
  }

  if (!categories) return <p className="text-sm text-ink-soft">Завантажуємо…</p>;

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b-[1.5px] border-line text-left text-[11px] font-bold text-ink-soft">
              <th className="w-[70px] py-2">Порядок</th>
              <th className="py-2">Назва</th>
              <th className="py-2" title="Цю папку вказують у налаштуваннях камери (FTP → Directory)">
                Папка для камери
              </th>
              <th className="py-2">Фото</th>
              <th className="py-2" title="Фото цієї категорії не бачать батьки: ні в галереї, ні в обраному, ні для альбому">
                Приховати від батьків
              </th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {categories.map((c, i) => (
              <tr key={c.key} className="border-b border-line">
                <td className="py-2">
                  <span className="inline-flex gap-0.5">
                    <button
                      onClick={() => move(i, -1)}
                      disabled={busy || i === 0}
                      className="rounded-md p-1 text-ink-soft hover:bg-purple-pale hover:text-purple disabled:opacity-25"
                      aria-label="Вище"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => move(i, 1)}
                      disabled={busy || i === categories.length - 1}
                      className="rounded-md p-1 text-ink-soft hover:bg-purple-pale hover:text-purple disabled:opacity-25"
                      aria-label="Нижче"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </td>
                <td className="py-2 pr-3">
                  <span className="flex items-center gap-1.5">
                    <CategoryIcon category={c.key} className="h-4 w-4 flex-shrink-0 text-purple" />
                    <LabelInput
                      value={c.label}
                      onSave={async (label) => {
                        await call(`/api/photo-categories/${c.key}`, "PATCH", { label }, "Назву збережено");
                      }}
                    />
                  </span>
                  {SYSTEM_HINT[c.key] && <span className="ml-7 block text-[10.5px] text-ink-soft">{SYSTEM_HINT[c.key]}</span>}
                </td>
                <td className="py-2 pr-3 font-mono text-[12px] text-ink-soft">
                  {c.key === "uncategorized" ? "/ (не вказувати)" : `/${c.key}`}
                </td>
                <td className="py-2 pr-3">{c.photoCount}</td>
                <td className="py-2 pr-3">
                  <span className="inline-flex items-center gap-1.5">
                    <Toggle
                      checked={c.hidden_from_parents}
                      onChange={(next) =>
                        call(
                          `/api/photo-categories/${c.key}`,
                          "PATCH",
                          { hiddenFromParents: next },
                          next ? `«${c.label}» приховано від батьків` : `«${c.label}» знову видно батькам`
                        )
                      }
                      disabled={busy}
                      aria-label="Приховати від батьків"
                    />
                    {c.hidden_from_parents && <EyeOff className="h-3.5 w-3.5 text-warn" />}
                  </span>
                </td>
                <td className="py-2 text-right">
                  {c.is_system ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-ink-soft" title="Службову категорію не можна видалити">
                      <Lock className="h-3.5 w-3.5" /> службова
                    </span>
                  ) : (
                    <button
                      onClick={() => remove(c)}
                      disabled={busy}
                      className="inline-flex items-center gap-1 rounded-[8px] px-2 py-1 text-[12px] font-semibold text-warn hover:bg-[#FDECEC] disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Видалити
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form onSubmit={add} className="flex flex-wrap items-center gap-2">
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Нова категорія, напр. «Випускний бал»"
          maxLength={60}
          className="min-w-[240px] flex-1 rounded-[9px] border border-line px-3 py-2 text-sm outline-none focus:border-purple"
        />
        <button
          type="submit"
          disabled={busy || !newLabel.trim()}
          className="inline-flex items-center gap-1 rounded-[9px] bg-purple px-3.5 py-2 text-[13px] font-bold text-white disabled:opacity-40"
        >
          <Plus className="h-4 w-4" /> Додати категорію
        </button>
      </form>

      {message && (
        <p className={`text-[12.5px] font-semibold ${message.type === "ok" ? "text-ok" : "text-warn"}`}>{message.text}</p>
      )}

      <p className="text-[11.5px] text-ink-soft">
        Назву можна змінювати будь-коли — вона одразу оновиться в адмінці й у батьків. «Папка для камери» створюється з
        назви при додаванні й більше не змінюється (її вказують у налаштуваннях камери). Порядок тут — це порядок кнопок
        у галереї, у формі завантаження й карток камер на сторінці «Прийом з камер».
      </p>
    </div>
  );
}
