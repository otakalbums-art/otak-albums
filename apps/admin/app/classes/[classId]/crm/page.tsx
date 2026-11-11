import { createSupabaseServerClient } from "@otak/supabase";
import { parseQuestions } from "@otak/supabase/cabinet";
import { Card } from "@otak/ui";
import { notFound } from "next/navigation";
import { CrmGrid } from "./crm-grid";
import { ClassSettingsPanel } from "./class-settings-panel";

/**
 * CRM-таблиця класу/групи — заміна ручних Google Sheets. Працює одразу після
 * створення класу: список дітей, час зйомки, анкета й оплати не залежать від
 * типу альбому; фото-слоти з'являються, коли тип альбому обрано
 * (налаштовуються на /album-types/[id]/slots).
 */
export default async function ClassCrmPage({ params }: { params: { classId: string } }) {
  const supabase = createSupabaseServerClient();

  const { data: klass } = await supabase
    .from("classes")
    .select(
      "id, name, album_type_id, shoot_date, slot_start, slot_end, slot_interval_min, parent_editing_enabled, questions, schools(name), album_types(name)"
    )
    .eq("id", params.classId)
    .maybeSingle();

  if (!klass) notFound();

  const { data: albumTypes } = await supabase
    .from("album_types")
    .select("id, name, category")
    .order("sort_order")
    .order("created_at");

  return (
    <Card title={`CRM — ${klass.name}, ${(klass as any).schools?.name ?? ""}`} menu={false}>
      <ClassSettingsPanel
        settings={{
          id: klass.id,
          album_type_id: klass.album_type_id,
          shoot_date: klass.shoot_date,
          slot_start: klass.slot_start,
          slot_end: klass.slot_end,
          slot_interval_min: klass.slot_interval_min,
          parent_editing_enabled: klass.parent_editing_enabled,
          questions: parseQuestions(klass.questions),
        }}
        albumTypes={albumTypes ?? []}
      />
      <p className="mb-4 text-xs text-ink-soft">
        {klass.album_type_id ? (
          <>
            Тип альбому: <b>{(klass as any).album_types?.name}</b>. Фото-слоти проставляєш, обираючи з уже
            завантажених фото класу.{" "}
          </>
        ) : (
          <>
            Тип альбому ще не обрано — колонки фото з'являться, щойно його оберуть вище.{" "}
          </>
        )}
        Клікни на будь-яку клітинку, щоб змінити. Зміни від батьків з'являються тут автоматично.
      </p>
      <CrmGrid classId={klass.id} />
    </Card>
  );
}
