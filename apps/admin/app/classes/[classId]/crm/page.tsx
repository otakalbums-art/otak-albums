import { createSupabaseServerClient } from "@otak/supabase";
import { Card } from "@otak/ui";
import { notFound } from "next/navigation";
import { CrmGrid } from "./crm-grid";

/**
 * CRM-таблиця класу: учень × слоти типу альбому (фото/текст) — заміна
 * ручних Google Sheets. Слоти налаштовуються на /album-types/[id]/slots.
 */
export default async function ClassCrmPage({ params }: { params: { classId: string } }) {
  const supabase = createSupabaseServerClient();

  const { data: klass } = await supabase
    .from("classes")
    .select("id, name, album_type_id, schools(name), album_types(name)")
    .eq("id", params.classId)
    .maybeSingle();

  if (!klass) notFound();

  return (
    <Card title={`CRM — ${klass.name}, ${(klass as any).schools?.name ?? ""}`} menu={false}>
      {!klass.album_type_id ? (
        <p className="text-sm text-ink-soft">
          У цього класу ще не обрано тип альбому — CRM-слоти прив'язані до типу альбому.
          Признач тип альбому класу на вкладці «Класи та папки», а сам набір слотів
          налаштовується на «Типи альбомів» → обраний тип → «Слоти CRM».
        </p>
      ) : (
        <>
          <p className="mb-4 text-xs text-ink-soft">
            Тип альбому: <b>{(klass as any).album_types?.name}</b>. Фото-слоти проставляєш,
            обираючи з уже завантажених фото класу; частину текстових слотів учні можуть
            заповнити самі на клієнтському сайті. Клікни на будь-яку клітинку, щоб змінити.
          </p>
          <CrmGrid classId={klass.id} />
        </>
      )}
    </Card>
  );
}
