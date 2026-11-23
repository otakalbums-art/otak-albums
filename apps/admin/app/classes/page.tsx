import { Card, StatusChip } from "@otak/ui";
import { createSupabaseServerClient } from "@otak/supabase/server";
import { CreateClassForm } from "./create-class-form";
import { ReferralLinkCell } from "./referral-link-cell";
import { Archive, Baby, ClipboardList, Images, Upload, Tags } from "lucide-react";
import { ClassRowActions, ParentFlagToggle } from "./class-row-actions";

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
    .select("id, name, kind, referral_code, status, parent_editing_enabled, parent_gallery_enabled, parent_download_enabled, schools(name), photos(count)")
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
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <span>Класи та групи садочка</span>
            <a
              href="/classes/categories"
              className="inline-flex items-center gap-1.5 rounded-[9px] border-[1.5px] border-line bg-card px-3 py-1.5 text-[12px] font-bold text-ink hover:border-purple-soft"
            >
              <Tags className="h-3.5 w-3.5" /> Категорії фото
            </a>
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

/** Телефон/планшет: кожен клас — окрема картка (8 колонок таблиці на вузькому екрані не вміщаються). */
function ClassCards({ classes }: { classes: any[] }) {
  if (!classes.length) return <p className="px-1 py-4 text-sm text-ink-soft">Активних класів і груп немає.</p>;
  return (
    <div className="flex flex-col gap-3">
      {classes.map((c: any) => (
        <div key={c.id} className="rounded-xl border border-line bg-page p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 text-[14px] font-bold">
              {c.kind === "kindergarten" && (
                <span className="mr-1.5 inline-flex items-center gap-1 rounded-full bg-[#E3F4EA] px-1.5 py-0.5 align-middle text-[10px] font-bold text-[#1E7B47]">
                  <Baby className="h-3 w-3" /> садочок
                </span>
              )}
              {c.name}, {c.schools?.name}
            </div>
            <StatusCell status={c.status} />
          </div>
          <div className="mt-1 text-[12px] text-ink-soft">Фото: <b className="text-ink">{c.photos?.[0]?.count ?? 0}</b></div>
          <div className="mt-2 min-w-0">
            <ReferralLinkCell url={`${SITE_URL}/login/${c.referral_code}`} />
          </div>
          {c.status !== "archived" && (
            <div className="mt-2.5 grid gap-1.5 rounded-[10px] bg-card p-2.5">
              {(
                [
                  ["parentEditingEnabled", "Редагування батьками", c.parent_editing_enabled],
                  ["parentGalleryEnabled", "Перегляд фото", c.parent_gallery_enabled],
                  ["parentDownloadEnabled", "Завантаження JPEG", c.parent_download_enabled],
                ] as const
              ).map(([flag, label, enabled]) => (
                <div key={flag} className="flex items-center justify-between gap-2 text-[12.5px]">
                  <span>{label}</span>
                  <ParentFlagToggle classId={c.id} flag={flag} enabled={enabled} />
                </div>
              ))}
            </div>
          )}
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {c.status !== "archived" && (
              <a href={`/classes/${c.id}/upload`} className={chip}>
                <Upload className="h-3.5 w-3.5" /> Завантажити фото
              </a>
            )}
            <a href={`/classes/${c.id}/photos`} className={chip}>
              <Images className="h-3.5 w-3.5" /> Фото
            </a>
            <a href={`/classes/${c.id}/crm`} className={chip}>
              <ClipboardList className="h-3.5 w-3.5" /> CRM
            </a>
            <ClassRowActions
              classId={c.id}
              classLabel={c.name}
              photoCount={c.photos?.[0]?.count ?? 0}
              archived={c.status === "archived"}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function ClassesTable({ classes }: { classes: any[] }) {
  return (
    <>
    <div className="xl:hidden">
      <ClassCards classes={classes} />
    </div>
    <div className="hidden overflow-x-auto xl:block">
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
            <th className="px-3 py-2">Клас / група</th>
            <th className="px-3 py-2">Фото</th>
            <th className="px-3 py-2">Реф. посилання</th>
            <th className="px-3 py-2">Статус</th>
            <th className="px-3 py-2" title="Час зйомки, анкета, вибір фото у місця альбому й «Підтвердити відбір»">
              Редагування батьками
            </th>
            <th className="px-3 py-2" title="Галерея й «Обране» для батьків. Вимкнено — фото приховані, нічого не видаляється">
              Перегляд фото
            </th>
            <th className="px-3 py-2" title="Кнопка ⤓ на фото й ZIP вибраних у галереї батьків">
              Завантаження JPEG
            </th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {classes.map((c: any) => (
            <tr key={c.id} className="border-b border-line">
              <td className="px-3 py-2.5">
                {c.kind === "kindergarten" && (
                  <span className="mr-1.5 inline-flex items-center gap-1 rounded-full bg-[#E3F4EA] px-1.5 py-0.5 align-middle text-[10px] font-bold text-[#1E7B47]">
                    <Baby className="h-3 w-3" /> садочок
                  </span>
                )}
                {c.name}, {c.schools?.name}
              </td>
              <td className="px-3 py-2.5">{c.photos?.[0]?.count ?? 0}</td>
              <td className="px-3 py-2.5">
                <ReferralLinkCell url={`${SITE_URL}/login/${c.referral_code}`} />
              </td>
              <td className="px-3 py-2.5">
                <StatusCell status={c.status} />
              </td>
              <td className="px-3 py-2.5">
                {c.status !== "archived" && (
                  <ParentFlagToggle classId={c.id} flag="parentEditingEnabled" enabled={c.parent_editing_enabled} />
                )}
              </td>
              <td className="px-3 py-2.5">
                {c.status !== "archived" && (
                  <ParentFlagToggle classId={c.id} flag="parentGalleryEnabled" enabled={c.parent_gallery_enabled} />
                )}
              </td>
              <td className="px-3 py-2.5">
                {c.status !== "archived" && (
                  <ParentFlagToggle classId={c.id} flag="parentDownloadEnabled" enabled={c.parent_download_enabled} />
                )}
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
                    photoCount={c.photos?.[0]?.count ?? 0}
                    archived={c.status === "archived"}
                  />
                </div>
              </td>
            </tr>
          ))}
          {classes.length === 0 && (
            <tr>
              <td colSpan={8} className="px-3 py-4 text-ink-soft">
                Активних класів і груп немає.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
    </>
  );
}
