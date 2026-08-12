import { createSupabaseServerClient } from "@otak/supabase";
import { AlbumTypeCreateForm } from "./album-type-create-form";
import { AlbumTypeCard } from "./album-type-card";

/**
 * Типи альбомів — редактор шаблонів структури папок (album_types.folder_template, jsonb).
 * Кожен клас посилається на один album_type; при створенні папки класу
 * бекенд копіює folder_template у реальну структуру Storage.
 */
export default async function AlbumTypesPage() {
  const supabase = createSupabaseServerClient();
  const { data: albumTypes } = await supabase
    .from("album_types")
    .select("*, classes(id)")
    .order("created_at");

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-[15.5px] font-bold">Типи альбомів</h3>
      </div>
      <AlbumTypeCreateForm />
      <div className="grid gap-3.5 sm:grid-cols-3">
        {albumTypes?.map((t: any) => (
          <AlbumTypeCard key={t.id} albumType={t} classesCount={t.classes?.length ?? 0} />
        ))}
      </div>
      {(!albumTypes || albumTypes.length === 0) && (
        <p className="mt-3 text-sm text-ink-soft">Типів альбомів ще немає — створи перший кнопкою вище.</p>
      )}
      <p className="mt-4 text-xs text-ink-soft">
        Типи альбомів закладені як окрема сутність — кожен тип визначає власний шаблон
        структури папок, який застосовується під час створення папки класу.
      </p>
    </div>
  );
}
