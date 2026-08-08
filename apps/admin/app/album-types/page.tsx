import { Card, Button } from "@otak/ui";
import { createSupabaseServerClient } from "@otak/supabase";

/**
 * Типи альбомів — редактор шаблонів структури папок (album_types.folder_template, jsonb).
 * Кожен клас посилається на один album_type; при створенні папки класу
 * бекенд копіює folder_template у реальну структуру Storage.
 */
export default async function AlbumTypesPage() {
  const supabase = createSupabaseServerClient();
  const { data: albumTypes } = await supabase.from("album_types").select("*").order("created_at");

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[15.5px] font-bold">Типи альбомів</h3>
        <Button size="sm" className="w-auto">+ Новий тип альбому</Button>
      </div>
      <div className="grid gap-3.5 sm:grid-cols-3">
        {albumTypes?.map((t: any) => (
          <div key={t.id} className="relative rounded-xl border border-line bg-card p-4">
            <div className="absolute right-3 top-3 flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-purple-pale text-[13px] font-extrabold text-purple-deep">
              {t.name[0]}
            </div>
            <h3 className="mb-1.5 text-[15px] font-bold">{t.name}</h3>
            <p className="text-xs text-ink-soft">
              {t.page_count ? `${t.page_count} сторінок · ` : ""}
              {(t.folder_template as any[])?.map((f) => f.name).join(", ")}
            </p>
          </div>
        ))}
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-purple-pale/40 p-4 text-center">
          <div className="mb-1.5 flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-card text-[13px] font-extrabold">+</div>
          <h3 className="mb-1 text-[15px] font-bold text-ink-soft">Створити власний</h3>
          <p className="text-xs text-ink-soft">Задайте назву, кількість сторінок і структуру підпапок.</p>
        </div>
      </div>
      <p className="mt-4 text-xs text-ink-soft">
        Типи альбомів закладені як окрема сутність — кожен тип визначає власний шаблон
        структури папок, який застосовується під час створення папки класу.
      </p>
    </div>
  );
}
