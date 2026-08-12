import { Card } from "@otak/ui";
import { createSupabaseServerClient } from "@otak/supabase/server";

/**
 * Точка входу в CRM — вибір класу. Сама таблиця учень×слоти —
 * /classes/[classId]/crm; набір слотів налаштовується на
 * /album-types/[albumTypeId]/slots (лінк "Слоти CRM →" на картці типу).
 */
export default async function CrmIndexPage() {
  const supabase = createSupabaseServerClient();
  const { data: classes } = await supabase
    .from("classes")
    .select("id, name, schools(name), album_types(name), students(id)")
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col gap-4">
      <Card title="CRM: портрети, цитати, анкети учнів" menu={false}>
        <p className="mb-3.5 text-xs text-ink-soft">
          Заміна ручних таблиць — хто яке фото обрав під портрет/студію, цитата чи анкета для
          сторінки в альбомі. Набір полів (слотів) налаштовується на «Типи альбомів» → обраний
          тип → «Слоти CRM»; тут — заповнення для конкретного класу.
        </p>

        {!classes || classes.length === 0 ? (
          <p className="text-sm text-ink-soft">Класів ще немає — створіть на вкладці «Класи та папки».</p>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b-[1.5px] border-line text-left text-[11px] font-bold text-ink-soft">
                <th className="py-2">Клас</th>
                <th>Тип альбому</th>
                <th>Учнів</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {classes.map((c: any) => (
                <tr key={c.id} className="border-b border-line">
                  <td className="py-2.5">{c.name}, {c.schools?.name}</td>
                  <td className="text-ink-soft">{c.album_types?.name ?? "— не обрано —"}</td>
                  <td>{c.students?.length ?? 0}</td>
                  <td>
                    <a href={`/classes/${c.id}/crm`} className="text-[12px] font-semibold text-purple hover:underline">
                      Відкрити CRM →
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
