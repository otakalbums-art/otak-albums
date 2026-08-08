"use client";

import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@otak/supabase/browser";

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      className="block w-full rounded-lg px-2.5 py-2.5 text-left text-[13px] font-semibold text-ink-soft hover:bg-page"
    >
      Вийти
    </button>
  );
}
