"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlbumTypeEditForm } from "./album-type-edit-form";

type AlbumType = {
  id: string;
  name: string;
  page_count: number | null;
  price: number | null;
  cost_price: number | null;
  folder_template: { name: string }[] | null;
};

export function AlbumTypeCard({ albumType, classesCount }: { albumType: AlbumType; classesCount: number }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete() {
    if (classesCount > 0) return;
    if (!confirm(`Видалити тип альбому "${albumType.name}"? Усі його слоти CRM теж зникнуть.`)) return;
    setDeleting(true);
    setDeleteError(null);
    const res = await fetch(`/api/album-types/${albumType.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setDeleting(false);
    if (!res.ok) {
      setDeleteError(data.error ?? "Не вдалося видалити");
      return;
    }
    router.refresh();
  }

  return (
    <div className="relative rounded-xl border border-line bg-card p-4">
      <div className="absolute right-3 top-3 flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-purple-pale text-[13px] font-extrabold text-purple-deep">
        {albumType.name[0]}
      </div>
      <h3 className="mb-1.5 text-[15px] font-bold">{albumType.name}</h3>
      <p className="text-xs text-ink-soft">
        {albumType.page_count ? `${albumType.page_count} сторінок · ` : ""}
        {(albumType.folder_template ?? []).map((f) => f.name).join(", ")}
      </p>
      {albumType.price && (
        <p className="mt-1 text-[12.5px] font-bold text-purple-deep">
          {albumType.price} ₴/екз.
          {albumType.cost_price ? <span className="ml-1 font-normal text-ink-soft">(собівартість {albumType.cost_price} ₴)</span> : null}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <a href={`/album-types/${albumType.id}/slots`} className="text-[12px] font-semibold text-purple hover:underline">
          Слоти CRM →
        </a>
        <button onClick={() => setEditing((v) => !v)} className="text-[12px] font-semibold text-purple hover:underline">
          ✎ Редагувати
        </button>
        {classesCount > 0 ? (
          <span className="text-[11.5px] text-ink-soft" title={`Використовується в ${classesCount} класах — спершу відв'яжіть їх`}>
            🗑 Видалити (використовується в {classesCount} {classesCount === 1 ? "класі" : "класах"})
          </span>
        ) : (
          <button onClick={handleDelete} disabled={deleting} className="text-[12px] font-semibold text-warn hover:underline disabled:opacity-50">
            🗑 {deleting ? "Видаляємо…" : "Видалити"}
          </button>
        )}
      </div>
      {deleteError && <p className="mt-1.5 text-[11px] font-semibold text-warn">{deleteError}</p>}

      {editing && <AlbumTypeEditForm albumType={albumType} onClose={() => setEditing(false)} />}
    </div>
  );
}
