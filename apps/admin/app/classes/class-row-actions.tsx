"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Loader2, Trash2 } from "lucide-react";

const btn =
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-line bg-page px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors disabled:opacity-50";

/** Архівувати / повернути з архіву / видалити остаточно — для одного рядка класу. */
export function ClassRowActions({
  classId,
  classLabel,
  photoCount,
  archived,
}: {
  classId: string;
  classLabel: string;
  photoCount: number;
  archived: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"archive" | "delete" | null>(null);

  async function toggleArchive() {
    const question = archived
      ? `Повернути клас «${classLabel}» з архіву? Учні знову зможуть заходити за посиланням.`
      : `Перенести клас «${classLabel}» в архів?\n\nУчні й посилання для мам перестануть працювати, але всі дані (учні, фото, CRM) збережуться. Клас можна буде повернути.`;
    if (!confirm(question)) return;

    setBusy("archive");
    const res = await fetch(`/api/classes/${classId}`, { method: "PATCH", body: JSON.stringify({ archived: !archived }) });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return alert(data.error ?? "Не вдалося змінити статус класу");
    router.refresh();
  }

  async function handleDelete() {
    const typed = prompt(
      `Видалити клас «${classLabel}» ОСТАТОЧНО?\n\n` +
        `Буде видалено всіх учнів, ${photoCount} фото (разом з файлами), CRM-дані й посилання для мам. Це не можна скасувати.\n\n` +
        `Щоб підтвердити, введіть назву класу: ${classLabel}`
    );
    if (typed === null) return;
    if (typed.trim() !== classLabel.trim()) return alert("Назва не збігається — клас не видалено.");

    setBusy("delete");
    const res = await fetch(`/api/classes/${classId}`, { method: "DELETE", body: JSON.stringify({ confirmName: typed }) });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return alert(data.error ?? "Не вдалося видалити клас");
    router.refresh();
  }

  return (
    <>
      <button onClick={toggleArchive} disabled={busy !== null} className={`${btn} text-ink hover:border-purple hover:text-purple`}>
        {busy === "archive" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : archived ? (
          <ArchiveRestore className="h-3.5 w-3.5" />
        ) : (
          <Archive className="h-3.5 w-3.5" />
        )}
        {archived ? "Повернути з архіву" : "В архів"}
      </button>
      <button onClick={handleDelete} disabled={busy !== null} className={`${btn} text-warn hover:border-warn`}>
        {busy === "delete" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        Видалити
      </button>
    </>
  );
}
