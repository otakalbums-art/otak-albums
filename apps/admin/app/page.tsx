import { Card, Donut } from "@otak/ui";
import { createSupabaseServerClient } from "@otak/supabase/server";

const PALETTE = ["#460464", "#8C57A8", "#C6A3D6", "#1FAA59", "#E14F4F", "#8A8E98"];

const CATEGORY_LABELS: Record<string, string> = {
  portrait: "Портрети",
  group: "Групові",
  ceremony: "Церемонія",
  personal: "Персональні",
  uncategorized: "Без категорії",
};

/**
 * Дашборд: прогрес відбору фото по класах (у % і в кількості учнів),
 * розподіл фото за категоріями, розподіл класів за типами альбомів.
 * "studentsDone" — учень, що зробив хоч один album_selections запис (у схемі
 * немає окремого прапорця "підтверджено", див. коментар у
 * apps/client/app/api/album-selection/confirm/route.ts).
 */
export default async function DashboardPage() {
  const supabase = createSupabaseServerClient();

  const { data: classes } = await supabase
    .from("classes")
    .select("id, name, schools(name), album_types(name), students(id, album_selections(id))")
    .order("name");

  const classProgress = (classes ?? []).map((c: any) => {
    const studentsTotal = c.students?.length ?? 0;
    const studentsDone = (c.students ?? []).filter((s: any) => (s.album_selections?.length ?? 0) > 0).length;
    return {
      name: `${c.name}, ${c.schools?.name ?? ""}`,
      albumType: c.album_types?.name ?? "Без типу",
      studentsTotal,
      studentsDone,
      percent: studentsTotal ? Math.round((studentsDone / studentsTotal) * 100) : 0,
    };
  });

  const totalStudents = classProgress.reduce((s, c) => s + c.studentsTotal, 0);
  const totalDone = classProgress.reduce((s, c) => s + c.studentsDone, 0);
  const avgPercent = totalStudents ? Math.round((totalDone / totalStudents) * 100) : 0;

  const { data: photoRows } = await supabase.from("photos").select("category");
  const categoryCounts = (photoRows ?? []).reduce((acc: Record<string, number>, p: any) => {
    acc[p.category] = (acc[p.category] ?? 0) + 1;
    return acc;
  }, {});
  const categorySegments = Object.entries(categoryCounts).map(([key, value], i) => ({
    label: CATEGORY_LABELS[key] ?? key,
    value: value as number,
    color: PALETTE[i % PALETTE.length],
  }));

  const albumTypeCounts = classProgress.reduce((acc: Record<string, number>, c) => {
    acc[c.albumType] = (acc[c.albumType] ?? 0) + 1;
    return acc;
  }, {});
  const albumTypeSegments = Object.entries(albumTypeCounts).map(([label, value], i) => ({
    label,
    value: value as number,
    color: PALETTE[i % PALETTE.length],
  }));

  return (
    <div>
      <div className="mb-4 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        <Card menu={false}>
          <div className="text-[30px] font-extrabold text-purple-deep">{classes?.length ?? 0}</div>
          <div className="text-xs font-semibold text-ink-soft">Активних класів</div>
        </Card>
        <Card menu={false}>
          <div className="text-[30px] font-extrabold text-purple-deep">{totalStudents}</div>
          <div className="text-xs font-semibold text-ink-soft">Учнів у роботі</div>
        </Card>
        <Card menu={false}>
          <div className="text-[30px] font-extrabold text-purple-deep">
            {totalStudents ? `${avgPercent}%` : "—"}
          </div>
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

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Card title="Фото за категоріями" menu={false}>
          {categorySegments.length > 0 ? (
            <Donut segments={categorySegments} centerLabel={photoRows?.length ?? 0} />
          ) : (
            <p className="text-sm text-ink-soft">Фото ще не завантажені.</p>
          )}
        </Card>
        <Card title="Класи за типами альбомів" menu={false}>
          {albumTypeSegments.length > 0 ? (
            <Donut segments={albumTypeSegments} centerLabel={classes?.length ?? 0} />
          ) : (
            <p className="text-sm text-ink-soft">Класів ще немає.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
