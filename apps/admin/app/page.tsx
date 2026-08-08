import { Card, Donut } from "@otak/ui";
import { createSupabaseServerClient } from "@otak/supabase";

/**
 * Дашборд: прогрес відбору фото по класах (у % і в кількості учнів),
 * розподіл фото за категоріями, розподіл класів за типами альбомів.
 * Дані підвантажуються server-side через RLS-захищений admin client
 * (адмін автентифікований у Supabase Auth, is_admin() = true).
 */
export default async function DashboardPage() {
  const supabase = createSupabaseServerClient();

  const { data: classes } = await supabase
    .from("classes")
    .select("id, name, schools(name), students(id)")
    .order("name");

  // TODO: замінити на реальний агрегований запит (RPC або view) —
  // тут спрощено для каркасу.
  const classProgress =
    classes?.map((c: any) => ({
      name: `${c.name}, ${c.schools?.name ?? ""}`,
      studentsTotal: c.students?.length ?? 0,
      studentsDone: 0,
      percent: 0,
    })) ?? [];

  return (
    <div>
      <div className="mb-4 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        <Card menu={false}>
          <div className="text-[30px] font-extrabold text-purple-deep">{classes?.length ?? 0}</div>
          <div className="text-xs font-semibold text-ink-soft">Активних класів</div>
        </Card>
        <Card menu={false}>
          <div className="text-[30px] font-extrabold text-purple-deep">
            {classProgress.reduce((s, c) => s + c.studentsTotal, 0)}
          </div>
          <div className="text-xs font-semibold text-ink-soft">Учнів у роботі</div>
        </Card>
        <Card menu={false}>
          <div className="text-[30px] font-extrabold text-purple-deep">—</div>
          <div className="text-xs font-semibold text-ink-soft">Середній прогрес відбору</div>
        </Card>
      </div>

      <Card title="Прогрес відбору фото за класами">
        <div className="flex flex-col gap-3.5">
          {classProgress.map((c) => (
            <div key={c.name} className="rounded-xl border border-line p-3.5">
              <div className="mb-2 flex justify-between text-[13.5px] font-bold">
                <span>{c.name}</span>
                <span>{c.percent}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-purple-pale">
                <div className="h-full bg-purple" style={{ width: `${c.percent}%` }} />
              </div>
              <div className="mt-1.5 text-[11.5px] text-ink-soft">
                {c.studentsDone} з {c.studentsTotal} учнів завершили відбір
              </div>
            </div>
          ))}
          {classProgress.length === 0 && (
            <p className="text-sm text-ink-soft">Класів ще немає — створіть перший на вкладці «Класи та папки».</p>
          )}
        </div>
      </Card>
    </div>
  );
}
