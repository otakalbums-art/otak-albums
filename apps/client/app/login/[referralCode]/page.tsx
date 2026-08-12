import { createSupabaseServiceRoleClient } from "@otak/supabase";
import { LoginForm } from "./login-form";

// Без cookies()/headers() Next.js вважає сторінку статичною й кешує fetch()
// до Supabase (Data Cache) на весь час роботи dev-сервера — той самий баг,
// що знайдено й виправлено в apps/client/app/mom-link/[token]/page.tsx
// 2026-08-11: зміна статусу класу (напр. архівація) чи назви не підхопилась
// би без force-dynamic.
export const dynamic = "force-dynamic";

/**
 * Вхід за реферальним посиланням класу — /login/{referral_code}
 * (посилання генерує адмінка, apps/admin/app/classes/referral-link-cell.tsx).
 * Клас/школу підтягуємо тут (сервер), щоб форма показувала реальну назву,
 * а не захардкожену — раніше referralCode теж був захардкожений у формі,
 * тож будь-яке посилання, крім одного тестового класу, було нероб очим.
 */
export default async function LoginWithReferralPage({ params }: { params: { referralCode: string } }) {
  const supabase = createSupabaseServiceRoleClient();

  const { data: klass } = await supabase
    .from("classes")
    .select("name, status, schools(name)")
    .eq("referral_code", params.referralCode)
    .maybeSingle();

  if (!klass || klass.status === "archived") {
    return (
      <div className="mx-auto max-w-[420px] rounded-2xl border border-line bg-card p-8 text-center shadow-card">
        <h1 className="mb-2 text-lg font-bold">Посилання недійсне</h1>
        <p className="text-sm text-ink-soft">
          Перевірте посилання ще раз або зверніться до фотографа/відповідальної особи класу за новим.
        </p>
      </div>
    );
  }

  return <LoginForm referralCode={params.referralCode} className={klass.name} schoolName={(klass as any).schools?.name ?? ""} />;
}
