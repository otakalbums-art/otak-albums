import { createSupabaseServiceRoleClient } from "@otak/supabase";
import { notFound } from "next/navigation";

/**
 * Публічна сторінка перегляду за "посиланням для мам".
 * Доступ БЕЗ входу за прізвищем/іменем — лише за токеном у URL.
 * Сервер перевіряє: чи не спливла expires_at, чи is_active=true (локальне
 * вимкнення), і чи не встановлено global_settings.mom_links_globally_disabled.
 */
export default async function MomLinkPage({ params }: { params: { token: string } }) {
  const supabase = createSupabaseServiceRoleClient();

  const { data: link } = await supabase
    .from("mom_links")
    .select("*, classes(name, schools(name))")
    .eq("token", params.token)
    .single();

  const { data: settings } = await supabase
    .from("global_settings")
    .select("mom_links_globally_disabled")
    .single();

  if (!link) return notFound();

  const expired = new Date(link.expires_at) < new Date();
  const disabled = !link.is_active || settings?.mom_links_globally_disabled;

  if (expired || disabled) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-line bg-card p-8 text-center shadow-card">
        <h1 className="mb-2 text-lg font-bold">Посилання більше не активне</h1>
        <p className="text-sm text-ink-soft">
          Термін дії цього посилання для перегляду завершився, або доступ був вимкнений
          адміністратором. Зверніться до відповідальної особи класу за новим посиланням.
        </p>
      </div>
    );
  }

  // TODO: підвантажити read-only галерею класу (без лайків/відбору — лише перегляд).
  return (
    <div>
      <h1 className="text-lg font-bold">
        Перегляд фото — {link.classes?.name}, {link.classes?.schools?.name}
      </h1>
      <p className="mt-1 text-sm text-ink-soft">
        Публічний перегляд без входу. Активний до{" "}
        {new Date(link.expires_at).toLocaleString("uk-UA")}.
      </p>
      {/* Галерея read-only рендериться тут (перевикористовує <PhotoTile> без onToggle*) */}
    </div>
  );
}
