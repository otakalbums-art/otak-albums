import { createSupabaseServerClient } from "@otak/supabase";
import { AlbumTypeCreateForm } from "./album-type-create-form";
import { AlbumTypeCard } from "./album-type-card";
import { AlbumOptionsEditor, SmallRunMarkupsEditor } from "./album-extras-editors";

const NO_CATEGORY = "Без категорії";

/**
 * Типи альбомів і прайс: типи згруповані за категорією (album_types.category),
 * нижче — додаткові опції (album_options) і націнка за малий тираж
 * (album_small_run_markups). Усе редагується прямо тут
 * (supabase/migrations/0012_album_catalog.sql).
 */
export default async function AlbumTypesPage() {
  const supabase = createSupabaseServerClient();
  const [{ data: albumTypes }, { data: options }, { data: markups }] = await Promise.all([
    supabase.from("album_types").select("*, classes(id)").order("sort_order").order("created_at"),
    supabase.from("album_options").select("id, category, name, price").order("sort_order").order("created_at"),
    supabase
      .from("album_small_run_markups")
      .select("id, min_albums, max_albums, surcharge")
      .order("sort_order")
      .order("created_at"),
  ]);

  // Групи в порядку першої появи (типи вже відсортовані за sort_order).
  const groups = new Map<string, any[]>();
  for (const t of albumTypes ?? []) {
    const key = t.category?.trim() || NO_CATEGORY;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  const categories = Array.from(
    new Set([...(albumTypes ?? []).map((t) => t.category), ...(options ?? []).map((o) => o.category)].filter(Boolean))
  ) as string[];

  return (
    <div>
      {/* Підказки для полів "Категорія" в усіх формах сторінки. */}
      <datalist id="album-categories">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-[15.5px] font-bold">Типи альбомів</h3>
      </div>
      <AlbumTypeCreateForm />

      {Array.from(groups.entries()).map(([category, types]) => (
        <section key={category} className="mb-5">
          <h4 className="mb-2 text-[13px] font-bold text-ink-soft">{category}</h4>
          <div className="grid gap-3.5 sm:grid-cols-3">
            {types.map((t: any) => (
              <AlbumTypeCard key={t.id} albumType={t} classesCount={t.classes?.length ?? 0} />
            ))}
          </div>
        </section>
      ))}
      {(!albumTypes || albumTypes.length === 0) && (
        <p className="mt-3 text-sm text-ink-soft">Типів альбомів ще немає — створи перший кнопкою вище.</p>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <section className="rounded-xl border border-line bg-card p-4">
          <h3 className="mb-3 text-[14px] font-bold">Додаткові опції</h3>
          <AlbumOptionsEditor options={options ?? []} />
        </section>
        <section className="rounded-xl border border-line bg-card p-4">
          <h3 className="mb-3 text-[14px] font-bold">Націнка за малий тираж</h3>
          <SmallRunMarkupsEditor markups={markups ?? []} />
        </section>
      </div>
    </div>
  );
}
