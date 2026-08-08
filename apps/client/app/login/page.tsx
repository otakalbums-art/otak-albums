"use client";

import { useState } from "react";
import { Card, Button } from "@otak/ui";

/**
 * Вхід за реферальним посиланням класу (?ref=11a-x7qk29 або /login/[referral_code]).
 * Учень вводить прізвище та ім'я — вони звіряються з таблицею students,
 * заповненою відповідальною особою класу. При збігу route handler
 * (app/api/auth/login/route.ts, ще не реалізовано) видає session_token
 * і ставить httpOnly cookie.
 */
export default function LoginPage() {
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // TODO: замінити на реальний referral_code (з query/route param)
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastName, firstName, referralCode: "11a-x7qk29" }),
      });
      if (!res.ok) throw new Error("Не вдалося увійти. Перевірте написання прізвища та імені.");
      window.location.href = "/gallery";
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
          Клас 11-А, ЗОШ №14 — введіть прізвище та ім'я, щоб отримати доступ до фото свого класу.
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
          Посилання дійсне лише для класу <b>11-А</b>. Його створює відповідальна особа з класу
          після того, як адміністратор відкриє папку — далі система генерує унікальне реферальне
          посилання автоматично.
        </div>
      </Card>
    </div>
  );
}
