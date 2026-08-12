import { createSupabaseServerClient } from "@otak/supabase";
import { Card } from "@otak/ui";
import { notFound } from "next/navigation";
import { SlotsEditor } from "./slots-editor";

/**
 * Слоти CRM-таблиці для типу альбому — фото-слоти (Портрет 1, фото "куб"...)
 * і текстові слоти (Цитата, Моя мрія...), спільні для всіх класів цього
 * типу альбому. Заповнення значень — на /classes/[classId]/crm.
 */
export default async function AlbumTypeSlotsPage({ params }: { params: { albumTypeId: string } }) {
  const supabase = createSupabaseServerClient();

  const { data: albumType } = await supabase
    .from("album_types")
    .select("id, name")
    .eq("id", params.albumTypeId)
    .maybeSingle();

  if (!albumType) notFound();

  const { data: slots } = await supabase
    .from("album_type_slots")
    .select("*")
    .eq("album_type_id", params.albumTypeId)
    .order("sort_order");

  return (
    <Card title={`Слоти CRM — ${albumType.name}`} menu={false}>
      <p className="mb-4 text-xs text-ink-soft">
        Слоти визначають, які фото й текстові поля потрібні на кожного учня для цього типу
        альбому (наприклад, "Портрет 1"/"Портрет 2"/фото студії — для школи; "Портрет 1"/фото
        "куб"/"Моя мрія" — для садочка). Застосовується до всіх класів з цим типом альбому.
      </p>
      <SlotsEditor albumTypeId={albumType.id} initialSlots={slots ?? []} />
    </Card>
  );
}
