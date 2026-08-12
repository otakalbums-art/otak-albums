import { Card, StatusChip } from "@otak/ui";
import { createSupabaseServerClient } from "@otak/supabase/server";
import { CreateClassForm } from "./create-class-form";
import { ReferralLinkCell } from "./referral-link-cell";

/**
 * Список класів + створення нової "папки класу" (POST /api/classes) —
 * генерує унікальний referral_code; реальна структура підпапок у Storage
 * не потребує попереднього створення, див. коментар у app/api/classes/route.ts.
 *
 * Посилання-запрошення — {NEXT_PUBLIC_SITE_URL}/login/{referral_code}
 * (клієнтський застосунок, apps/client/app/login/[referralCode]/page.tsx).
 */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default async function ClassesPage() {
  const supabase = createSupabaseServerClient();
  const { data: classes } = await supabase
    .from("classes")
    .select("id, name, referral_code, status, schools(name), photos(id)")
    .order("created_at", { ascending: false });

  const { data: schools } = await supabase.from("schools").select("id, name").order("name");
  const { data: albumTypes } = await supabase.from("album_types").select("id, name").order("name");

  return (
    <div>
      <Card
        title={
          <div className="flex w-full items-center justify-between">
            <span>Класи</span>
          </div>
        }
        menu={false}
      >
        <CreateClassForm schools={schools ?? []} albumTypes={albumTypes ?? []} />
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-[13px]">
            <colgroup>
              <col className="w-[18%]" />
              <col className="w-[7%]" />
              <col className="w-[19%]" />
              <col className="w-[10%]" />
              <col />
            </colgroup>
            <thead>
              <tr className="border-b-[1.5px] border-line text-left text-[11px] font-bold text-ink-soft">
                <th className="px-3 py-2">Клас</th>
                <th className="px-3 py-2">Фото</th>
                <th className="px-3 py-2">Реф. посилання</th>
                <th className="px-3 py-2">Статус</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {classes?.map((c: any) => (
                <tr key={c.id} className="border-b border-line">
                  <td className="px-3 py-2.5">{c.name}, {c.schools?.name}</td>
                  <td className="px-3 py-2.5">{c.photos?.length ?? 0}</td>
                  <td className="px-3 py-2.5">
                    <ReferralLinkCell url={`${SITE_URL}/login/${c.referral_code}`} />
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusChip status={c.status === "active" ? "active" : "off"}>
                      {c.status === "active" ? "Активна" : "Очікує"}
                    </StatusChip>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      <a
                        href={`/classes/${c.id}/upload`}
                        className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-line bg-page px-2.5 py-1.5 text-[11.5px] font-semibold text-ink transition-colors hover:border-purple hover:text-purple"
                      >
                        📤 Завантажити фото
                      </a>
                      <a
                        href={`/classes/${c.id}/photos`}
                        className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-line bg-page px-2.5 py-1.5 text-[11.5px] font-semibold text-ink transition-colors hover:border-purple hover:text-purple"
                      >
                        🖼️ Фото (JPEG + RAW)
                      </a>
                      <a
                        href={`/classes/${c.id}/crm`}
                        className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-line bg-page px-2.5 py-1.5 text-[11.5px] font-semibold text-ink transition-colors hover:border-purple hover:text-purple"
                      >
                        📋 CRM
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2.5 text-xs text-ink-soft">
          Після створення папки класу реферальне посилання генерується автоматично й
          надсилається відповідальній особі для заповнення форми учнів.
        </p>
      </Card>
    </div>
  );
}
