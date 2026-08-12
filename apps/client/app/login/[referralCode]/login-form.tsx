"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button } from "@otak/ui";
import { rememberReferralCode } from "@/lib/session-redirect";

/** Форма входу за реферальним посиланням — сам код передається пропом, не хардкодиться. */
export function LoginForm({ referralCode, className, schoolName }: { referralCode: string; className: string; schoolName: string }) {
  const router = useRouter();
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastName, firstName, referralCode }),
      });
      if (!res.ok) {
        // /api/auth/login завжди повертає конкретне {error} — 401 "не
        // знайдено" чи 404 "клас не знайдено" — показуємо його як є, а не
        // однаковий загальний текст для будь-якої причини провалу.
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Неправильні дані для входу. Перевірте написання прізвища та імені.");
      }
      // Запам'ятовуємо код для майбутніх редіректів на 401 (session-redirect.ts)
      // і йдемо replace-ом, а не звичайною навігацією — щоб сама форма входу
      // не лишалась в історії браузера. Інакше кнопка "Назад" з галереї
      // повертала на порожню форму входу замість попередньої реальної
      // сторінки, що виглядало як "викинуло з акаунту".
      rememberReferralCode(referralCode);
      router.replace("/gallery");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Сталася помилка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-[420px]">
      <Card title={null} menu={false}>
        <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-soft">
          Вхід за інвайтом
        </div>
        <h1 className="mb-1.5 text-2xl font-bold">Ви отримали запрошення</h1>
        <p className="mb-5 text-[13.5px] text-ink-soft">
          Клас {className}, {schoolName} — введіть прізвище та ім'я, щоб отримати доступ до фото свого класу.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="mb-3.5">
            <label className="mb-1.5 block text-[11.5px] font-semibold text-ink-soft">Прізвище</label>
            <input
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Коваленко"
              className="w-full rounded-[9px] border-[1.5px] border-line bg-page px-3.5 py-[11px] text-[13.5px] focus:border-purple focus:bg-white focus:outline-none"
            />
          </div>
          <div className="mb-3.5">
            <label className="mb-1.5 block text-[11.5px] font-semibold text-ink-soft">Ім'я</label>
            <input
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Марія"
              className="w-full rounded-[9px] border-[1.5px] border-line bg-page px-3.5 py-[11px] text-[13.5px] focus:border-purple focus:bg-white focus:outline-none"
            />
          </div>
          {error && <p className="mb-3 text-[12.5px] text-warn">{error}</p>}
          <Button type="submit" disabled={loading}>
            {loading ? "Входимо…" : "Увійти до галереї"}
          </Button>
        </form>
        <div className="mt-4 rounded-[10px] bg-purple-pale p-3.5 text-xs text-ink-soft">
          Посилання дійсне лише для класу <b>{className}</b>. Його створює адміністратор при
          відкритті папки класу — далі система генерує унікальне реферальне посилання автоматично.
        </div>
      </Card>
    </div>
  );
}
