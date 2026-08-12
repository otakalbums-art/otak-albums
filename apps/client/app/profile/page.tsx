"use client";

import { useEffect, useState } from "react";
import { Card, Button } from "@otak/ui";
import { redirectToLogin } from "@/lib/session-redirect";

type Slot = { id: string; key: string; label: string };

/**
 * Сторінка самообслуговування учня — заповнення власних текстових CRM-слотів
 * (Цитата, Моя мрія...), решту (фото-слоти, і частину тексту) проставляє
 * адмін в /classes/[classId]/crm. Список слотів залежить від типу альбому
 * класу — якщо жодного слоту "від учня" немає, показуємо про це повідомлення.
 */
export default function ProfilePage() {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => {
        if (r.status === 401) {
          redirectToLogin();
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (!data) return;
        setSlots(data.slots ?? []);
        setAnswers(data.answers ?? {});
      })
      .catch(() => setError("Не вдалося завантажити анкету"));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      if (res.status === 401) {
        redirectToLogin();
        return;
      }
      if (!res.ok) throw new Error("Не вдалося зберегти");
      setStatus("saved");
    } catch {
      setError("Не вдалося зберегти. Спробуй ще раз.");
      setStatus("idle");
    }
  }

  return (
    <div className="mx-auto max-w-[560px]">
      <Card title={null} menu={false}>
        <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-soft">Анкета</div>
        <h1 className="mb-1.5 text-2xl font-bold">Мій профіль</h1>
        <p className="mb-5 text-[13.5px] text-ink-soft">
          Ці відповіді підуть на твою сторінку в альбомі — заповни те, що хочеш бачити надрукованим.
        </p>

        {slots === null ? (
          <p className="text-sm text-ink-soft">Завантажуємо…</p>
        ) : slots.length === 0 ? (
          <p className="text-sm text-ink-soft">
            Для твого альбому немає полів, які потрібно заповнити самостійно — все інше проставляє
            фотограф.
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            {slots.map((slot) => (
              <div key={slot.id} className="mb-3.5">
                <label className="mb-1.5 block text-[11.5px] font-semibold text-ink-soft">{slot.label}</label>
                <textarea
                  value={answers[slot.id] ?? ""}
                  onChange={(e) => setAnswers((prev) => ({ ...prev, [slot.id]: e.target.value }))}
                  rows={2}
                  className="w-full rounded-[9px] border-[1.5px] border-line bg-page px-3.5 py-[11px] text-[13.5px] focus:border-purple focus:bg-white focus:outline-none"
                />
              </div>
            ))}
            {error && <p className="mb-3 text-[12.5px] text-warn">{error}</p>}
            <Button type="submit" disabled={status === "saving"}>
              {status === "saving" ? "Зберігаємо…" : status === "saved" ? "✓ Збережено" : "Зберегти"}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
