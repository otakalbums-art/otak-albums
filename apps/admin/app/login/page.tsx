"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@otak/supabase/browser";
import { Card, Button } from "@otak/ui";

/**
 * Логін адміна — звичайний Supabase Auth (email+пароль).
 * Реєстрація нових адмінів вимкнена (`enable_signup = false`), акаунти
 * створюються вручну через Supabase Dashboard / service role
 * (див. docs/auth-strategy.md).
 */
export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);
    if (signInError) {
      setError("Невірний email або пароль.");
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="mx-auto mt-[10vh] max-w-[380px]">
      <Card title="Вхід в адмін-панель" menu={false}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-soft">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-[9px] border border-line px-3 py-2 text-sm outline-none focus:border-purple"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-soft">Пароль</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-[9px] border border-line px-3 py-2 text-sm outline-none focus:border-purple"
            />
          </div>
          {error && <p className="text-xs font-semibold text-warn">{error}</p>}
          <Button type="submit" disabled={loading}>
            {loading ? "Входимо…" : "Увійти"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
