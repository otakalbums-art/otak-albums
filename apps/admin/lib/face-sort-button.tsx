"use client";

import { useEffect, useState } from "react";
import { ScanFace } from "lucide-react";

/**
 * «Розсортувати за обличчями»: стан аналізу облич класу (робить сервер камер,
 * scripts/face-worker.py) + кнопка, що розкладає вже проаналізовані фото за
 * правилами категорій (1 обличчя / 2+ облич). Використовується в галереї
 * фото класу і після ручного завантаження.
 */
export function FaceSortButton({ classId, compact = false }: { classId: string; compact?: boolean }) {
  const [stats, setStats] = useState<{ total: number; analyzed: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch(`/api/classes/${classId}/faces`, { cache: "no-store" });
      if (!res.ok || cancelled) return;
      setStats(await res.json());
    }
    load();
    const id = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [classId]);

  async function run() {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/classes/${classId}/faces`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMessage({ type: "error", text: data.error ?? "Не вдалося розсортувати" });
    setStats({ total: data.total, analyzed: data.analyzed });
    const waiting = data.total - data.analyzed;
    setMessage({
      type: "ok",
      text:
        (data.moved ? `Переміщено кадрів: ${data.moved}.` : "Усе вже розкладено правильно.") +
        (waiting ? ` Ще ${waiting} фото чекають на аналіз — вони розсортуються самі, щойно сервер їх обробить.` : ""),
    });
  }

  const waiting = stats ? stats.total - stats.analyzed : 0;
  return (
    <div className={`flex flex-wrap items-center gap-2 ${compact ? "" : "mb-4"}`}>
      <button
        onClick={run}
        disabled={busy || !stats?.total}
        title="Кадри з однією дитиною — у категорію з правилом «1 обличчя», з кількома — у «2+ облич» (сторінка «Категорії фото»)"
        className="inline-flex items-center gap-1 rounded-[9px] border-[1.5px] border-line bg-card px-3 py-1.5 text-[12px] font-bold text-ink hover:border-purple-soft disabled:opacity-40"
      >
        <ScanFace className="h-3.5 w-3.5" /> {busy ? "Сортуємо…" : "Розсортувати за обличчями"}
      </button>
      {stats && stats.total > 0 && (
        <span className="text-[11px] text-ink-soft">
          Обличчя проаналізовано: {stats.analyzed} з {stats.total}
          {waiting > 0 && " — сервер обробляє решту у фоні"}
        </span>
      )}
      {message && (
        <span className={`w-full text-[12px] font-semibold ${message.type === "ok" ? "text-ok" : "text-warn"}`}>
          {message.text}
        </span>
      )}
    </div>
  );
}
