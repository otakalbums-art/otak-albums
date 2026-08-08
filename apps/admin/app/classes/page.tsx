import { Card, Button, StatusChip } from "@otak/ui";
import { createSupabaseServerClient } from "@otak/supabase";

/**
 * Список класів + генерація реферального посилання при створенні папки класу.
 * Реальне створення (POST /api/admin/classes) має:
 *   1) вставити рядок у `classes` з унікальним referral_code (nanoid),
 *   2) створити базову структуру підпапок у Storage за шаблоном обраного album_type,
 *   3) повернути посилання для надсилання відповідальній особі класу.
 */
export default async function ClassesPage() {
  const supabase = createSupabaseServerClient();
  const { data: classes } = await supabase
    .from("classes")
    .select("id, name, referral_code, status, schools(name), photos(id)")
    .order("created_at", { ascending: false });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card
        title={
          <div className="flex w-full items-center justify-between">
            <span>Класи</span>
          </div>
        }
        menu={false}
      >
        <div className="mb-3 flex justify-end">
          <Button size="sm" className="w-auto">+ Створити папку класу</Button>
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b-[1.5px] border-line text-left text-[11px] font-bold text-ink-soft">
              <th className="py-2">Клас</th>
              <th>Фото</th>
              <th>Реф. посилання</th>
              <th>Статус</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {classes?.map((c: any) => (
              <tr key={c.id} className="border-b border-line">
                <td className="py-2.5">{c.name}, {c.schools?.name}</td>
                <td>{c.photos?.length ?? 0}</td>
                <td className="font-mono text-[11.5px]">{c.referral_code}</td>
                <td>
                  <StatusChip status={c.status === "active" ? "active" : "off"}>
                    {c.status === "active" ? "Активна" : "Очікує"}
                  </StatusChip>
                </td>
                <td>
                  <a href={`/classes/${c.id}/upload`} className="text-[12px] font-semibold text-purple hover:underline">
                    Завантажити фото
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2.5 text-xs text-ink-soft">
          Після створення папки класу реферальне посилання генерується автоматично й
          надсилається відповідальній особі для заповнення форми учнів.
        </p>
      </Card>

      <Card title="Структура папок" menu={false}>
        <p className="text-xs text-ink-soft">
          Обери клас зі списку ліворуч, щоб побачити й керувати деревом папок
          (Вибрані → Портрети / Групові / Церемонія + персональні папки учнів).
          Структура для кожного класу генерується автоматично з шаблону
          обраного типу альбому (див. «Типи альбомів»), редагування вручну —
          через файловий менеджер Storage.
        </p>
      </Card>
    </div>
  );
}
