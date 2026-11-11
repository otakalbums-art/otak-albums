"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@otak/ui";
import { X } from "lucide-react";

const inputCls = "w-full rounded-[8px] border border-line px-2 py-1.5 text-xs outline-none focus:border-purple";

/** Спільний механізм збереження/видалення одного рядка — повертає стан і дії. */
function useRowActions(endpoint: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(method: "POST" | "PATCH" | "DELETE", url: string, body?: unknown) {
    setBusy(true);
    setError(null);
    const res = await fetch(url, { method, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Не вдалося зберегти");
      return false;
    }
    router.refresh();
    return true;
  }

  return {
    busy,
    error,
    create: (body: unknown) => send("POST", endpoint, body),
    save: (id: string, body: unknown) => send("PATCH", `${endpoint}/${id}`, body),
    remove: (id: string) => send("DELETE", `${endpoint}/${id}`),
  };
}

// ---------------------------------------------------------------------------
// Додаткові опції
// ---------------------------------------------------------------------------

export type AlbumOption = { id: string; category: string | null; name: string; price: number | null };

function OptionRow({ option }: { option?: AlbumOption }) {
  const isNew = !option;
  const { busy, error, create, save, remove } = useRowActions("/api/album-options");
  const [category, setCategory] = useState(option?.category ?? "");
  const [name, setName] = useState(option?.name ?? "");
  const [price, setPrice] = useState(option?.price != null ? String(option.price) : "");

  const dirty =
    isNew ||
    category !== (option.category ?? "") ||
    name !== option.name ||
    price !== (option.price != null ? String(option.price) : "");

  async function handleSave() {
    const body = { category, name, price };
    if (isNew) {
      if (await create(body)) {
        setCategory("");
        setName("");
        setPrice("");
      }
    } else {
      await save(option.id, body);
    }
  }

  async function handleDelete() {
    if (!option || !confirm(`Видалити опцію "${option.name}"?`)) return;
    await remove(option.id);
  }

  return (
    <div>
      <div className="grid grid-cols-[1fr_2fr_90px_auto] items-center gap-2">
        <input list="album-categories" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Категорія" className={inputCls} />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={isNew ? "Нова опція" : "Назва"} className={inputCls} />
        <input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="₴" className={inputCls} />
        <div className="flex gap-1.5">
          {dirty && (
            <Button size="sm" className="w-auto" onClick={handleSave} disabled={busy || !name.trim()}>
              {isNew ? "Додати" : "Зберегти"}
            </Button>
          )}
          {!isNew && (
            <button onClick={handleDelete} disabled={busy} aria-label="Видалити опцію" className="px-1 text-ink-soft hover:text-warn disabled:opacity-50">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      {error && <p className="mt-1 text-[11px] font-semibold text-warn">{error}</p>}
    </div>
  );
}

export function AlbumOptionsEditor({ options }: { options: AlbumOption[] }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[1fr_2fr_90px_auto] gap-2 text-[10.5px] font-semibold text-ink-soft">
        <span>Категорія</span>
        <span>Опція</span>
        <span>Ціна, ₴</span>
        <span />
      </div>
      {options.map((o) => (
        <OptionRow key={o.id} option={o} />
      ))}
      <OptionRow key={`new-${options.length}`} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Націнка за малий тираж
// ---------------------------------------------------------------------------

export type SmallRunMarkup = { id: string; min_albums: number | null; max_albums: number | null; surcharge: number };

const str = (n: number | null | undefined) => (n != null ? String(n) : "");

function MarkupRow({ markup }: { markup?: SmallRunMarkup }) {
  const isNew = !markup;
  const { busy, error, create, save, remove } = useRowActions("/api/album-markups");
  const [minAlbums, setMinAlbums] = useState(str(markup?.min_albums));
  const [maxAlbums, setMaxAlbums] = useState(str(markup?.max_albums));
  const [surcharge, setSurcharge] = useState(str(markup?.surcharge));

  const dirty =
    isNew ||
    minAlbums !== str(markup.min_albums) ||
    maxAlbums !== str(markup.max_albums) ||
    surcharge !== str(markup.surcharge);

  async function handleSave() {
    const body = { minAlbums, maxAlbums, surcharge };
    if (isNew) {
      if (await create(body)) {
        setMinAlbums("");
        setMaxAlbums("");
        setSurcharge("");
      }
    } else {
      await save(markup.id, body);
    }
  }

  async function handleDelete() {
    if (!markup || !confirm("Видалити це правило націнки?")) return;
    await remove(markup.id);
  }

  return (
    <div>
      <div className="grid grid-cols-[70px_70px_90px_auto] items-center gap-2">
        <input type="number" min={0} value={minAlbums} onChange={(e) => setMinAlbums(e.target.value)} placeholder="—" className={inputCls} />
        <input type="number" min={0} value={maxAlbums} onChange={(e) => setMaxAlbums(e.target.value)} placeholder="—" className={inputCls} />
        <input type="number" min={0} value={surcharge} onChange={(e) => setSurcharge(e.target.value)} placeholder="+ ₴" className={inputCls} />
        <div className="flex gap-1.5">
          {dirty && (
            <Button size="sm" className="w-auto" onClick={handleSave} disabled={busy || surcharge === ""}>
              {isNew ? "Додати" : "Зберегти"}
            </Button>
          )}
          {!isNew && (
            <button onClick={handleDelete} disabled={busy} aria-label="Видалити правило" className="px-1 text-ink-soft hover:text-warn disabled:opacity-50">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      {error && <p className="mt-1 text-[11px] font-semibold text-warn">{error}</p>}
    </div>
  );
}

export function SmallRunMarkupsEditor({ markups }: { markups: SmallRunMarkup[] }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[70px_70px_90px_auto] gap-2 text-[10.5px] font-semibold text-ink-soft">
        <span>Від, шт.</span>
        <span>До, шт.</span>
        <span>Націнка, ₴</span>
        <span />
      </div>
      {markups.map((m) => (
        <MarkupRow key={m.id} markup={m} />
      ))}
      <MarkupRow key={`new-${markups.length}`} />
      <p className="text-[11px] text-ink-soft">
        Кількість — скільки альбомів замовляє клас. Порожнє поле = без межі (напр. «до 9» без «від» — менше 10).
        Довідково: суму замовлення учня в CRM і далі вписуєш вручну.
      </p>
    </div>
  );
}
