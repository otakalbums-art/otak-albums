import { Card, StatusChip } from "@otak/ui";
import { createSupabaseServerClient } from "@otak/supabase/server";
import { CreateClassForm } from "./create-class-form";
import { ReferralLinkCell } from "./referral-link-cell";
import { Archive, ClipboardList, Images, Upload } from "lucide-react";
import { ClassRowActions, ParentEditingToggle } from "./class-row-actions";

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
    .select("id, name, referral_code, status, parent_editing_enabled, schools(name), photos(id)")
    .order("created_at", { ascending: false });

  const { data: schools } = await supabase.from("schools").select("id, name").order("name");
  const { data: albumTypes } = await supabase
    .from("album_types")
    .select("id, name, category")
    .order("sort_order")
    .order("created_at");

  const active = (classes ?? []).filter((c: any) => c.status !== "archived");
  const archived = (classes ?? []).filter((c: any) => c.status === "archived");

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
        <ClassesTable classes={active} />
        <p className="mt-2.5 text-xs text-ink-soft">
          Після створення папки класу реферальне посилання генерується автоматично й
          надсилається відповідальній особі для заповнення форми учнів.
        </p>
      </Card>

      {archived.length > 0 && (
        <div className="mt-5">
          <Card
            title={
              <span className="inline-flex items-center gap-1.5">
                <Archive className="h-4 w-4" /> Архів ({archived.length})
              </span>
            }
            menu={false}
          >
            <ClassesTable classes={archived} />
            <p className="mt-2.5 text-xs text-ink-soft">
              Архівні класи неактивні: учні не можуть зайти, посилання для мам не відкриваються,
              камери не приймають фото. Усі дані збережені — клас можна повернути.
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}

const chip =
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-line bg-page px-2.5 py-1.5 text-[11.5px] font-semibold text-ink transition-colors hover:border-purple hover:text-purple";

function StatusCell({ status }: { status: string }) {
  if (status === "archived") {
    return <span className="rounded-full bg-line px-[9px] py-[3px] text-[10.5px] font-bold text-ink-soft">Архів</span>;
  }
  return (
    <StatusChip status={status === "active" ? "active" : "off"}>{status === "active" ? "Активна" : "Очікує"}</StatusChip>
  );
}

function ClassesTable({ classes }: { classes: any[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed text-[13px]">
        <colgroup>
          <col className="w-[15%]" />
          <col className="w-[5%]" />
          <col className="w-[16%]" />
          <col className="w-[8%]" />
          <col className="w-[10%]" />
          <col />
        </colgroup>
        <thead>
          <tr className="border-b-[1.5px] border-line text-left text-[11px] font-bold text-ink-soft">
            <th className="px-3 py-2">Клас</th>
            <th className="px-3 py-2">Фото</th>
            <th className="px-3 py-2">Реф. посилання</th>
            <th className="px-3 py-2">Статус</th>
            <th className="px-3 py-2">Редагування батьками</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {classes.map((c: any) => (
            <tr key={c.id} className="border-b border-line">
              <td className="px-3 py-2.5">
                {c.name}, {c.schools?.name}
              </td>
              <td className="px-3 py-2.5">{c.photos?.length ?? 0}</td>
              <td className="px-3 py-2.5">
                <ReferralLinkCell url={`${SITE_URL}/login/${c.referral_code}`} />
              </td>
              <td className="px-3 py-2.5">
                <StatusCell status={c.status} />
              </td>
              <td className="px-3 py-2.5">
                {c.status !== "archived" && <ParentEditingToggle classId={c.id} enabled={c.parent_editing_enabled} />}
              </td>
              <td className="px-3 py-2.5">
                <div className="flex flex-wrap gap-1.5">
                  {c.status !== "archived" && (
                    <a href={`/classes/${c.id}/upload`} className={chip}>
                      <Upload className="h-3.5 w-3.5" /> Завантажити фото
                    </a>
                  )}
                  <a href={`/classes/${c.id}/photos`} className={chip}>
                    <Images className="h-3.5 w-3.5" /> Фото (JPEG + RAW)
                  </a>
                  <a href={`/classes/${c.id}/crm`} className={chip}>
                    <ClipboardList className="h-3.5 w-3.5" /> CRM
                  </a>
                  <ClassRowActions
                    classId={c.id}
                    classLabel={c.name}
                    photoCount={c.photos?.length ?? 0}
                    archived={c.status === "archived"}
                  />
                </div>
              </td>
            </tr>
          ))}
          {classes.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-4 text-ink-soft">
                Активних класів немає.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
