import { Card, Donut, StatusChip } from "@otak/ui";
import { createSupabaseServerClient } from "@otak/supabase/server";
import { ftpStatus } from "@/lib/ftp-process-manager";

const PALETTE = ["#460464", "#8C57A8", "#C6A3D6", "#1FAA59", "#E14F4F", "#8A8E98"];

const CATEGORY_LABELS: Record<string, string> = {
  portrait: "Портрети",
  group: "Групові",
  ceremony: "Церемонія",
  personal: "Персональні",
  uncategorized: "Без категорії",
};

const ORDER_STATUS_LABEL: Record<string, string> = {
  not_ordered: "Не замовили",
  ordered: "Замовили",
  partially_paid: "Частково оплатили",
  paid: "Оплатили повністю",
  free: "Безкоштовно",
};
const ORDER_STATUS_STYLE: Record<string, string> = {
  not_ordered: "bg-line text-ink-soft",
  ordered: "bg-[#FFF4D6] text-[#8A6D00]",
  partially_paid: "bg-[#FFE8D1] text-[#A05A00]",
  paid: "bg-[#E7F7EE] text-ok",
  free: "bg-[#DCEEFF] text-[#0A5FA8]",
};

/**
 * Дашборд: прогрес відбору фото по класах (у % і в кількості учнів, лише
 * реальні учні — персонал/is_staff рахується окремо), розподіл фото за
 * категоріями, розподіл класів за типами альбомів, фінанси + розподіл
 * оплат по статусах, і оперативний стан системи (прийом з камер, посилання
 * для мам) — щоб не заходити в окремі вкладки лише перевірити.
 *
 * "studentsDone" — учень із заповненим students.selection_confirmed_at,
 * тобто явно натиснув "Підтвердити відбір" на /album
 * (apps/client/app/api/album-slots/confirm/route.ts) — заміна старого
 * плаского album_selections, який більше нічим не наповнюється
 * (supabase/migrations/0007_album_selection_confirm.sql).
 */
export default async function DashboardPage() {
  const supabase = createSupabaseServerClient();

  const { data: classes } = await supabase
    .from("classes")
    .select("id, name, schools(name), album_types(name), students(id, is_staff, selection_confirmed_at)")
    .order("name");

  const classProgress = (classes ?? []).map((c: any) => {
    const realStudents = (c.students ?? []).filter((s: any) => !s.is_staff);
    const studentsTotal = realStudents.length;
    const studentsDone = realStudents.filter((s: any) => s.selection_confirmed_at).length;
    const staffTotal = (c.students ?? []).length - studentsTotal;
    return {
      name: `${c.name}, ${c.schools?.name ?? ""}`,
      albumType: c.album_types?.name ?? "Без типу",
      studentsTotal,
      studentsDone,
      staffTotal,
      percent: studentsTotal ? Math.round((studentsDone / studentsTotal) * 100) : 0,
    };
  });

  const totalStudents = classProgress.reduce((s, c) => s + c.studentsTotal, 0);
  const totalStaff = classProgress.reduce((s, c) => s + c.staffTotal, 0);
  const totalDone = classProgress.reduce((s, c) => s + c.studentsDone, 0);
  const avgPercent = totalStudents ? Math.round((totalDone / totalStudents) * 100) : 0;

  // Фінанси: ціна — за екземпляр (на учня), персонал (is_staff) альбом не купує.
  const { data: financeStudents } = await supabase
    .from("students")
    .select("order_status, order_amount, classes(album_types(price, cost_price))")
    .eq("is_staff", false);

  let potentialRevenue = 0;
  let paidRevenue = 0;
  let paidCost = 0;
  const orderCounts: Record<string, number> = { not_ordered: 0, ordered: 0, partially_paid: 0, paid: 0, free: 0 };
  for (const s of financeStudents ?? []) {
    const albumType = (s as any).classes?.album_types;
    orderCounts[s.order_status] = (orderCounts[s.order_status] ?? 0) + 1;
    // "Безкоштовно" — свідомо видано без оплати, повністю поза фінансовою
    // статистикою (ні в потенційний дохід, ні в оплачено/собівартість).
    if (s.order_status === "free") continue;
    potentialRevenue += albumType?.price ?? 0;
    if (s.order_status === "paid") {
      paidRevenue += s.order_amount ?? albumType?.price ?? 0;
      paidCost += albumType?.cost_price ?? 0;
    }
  }
  const profit = paidRevenue - paidCost;

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

  // Оперативний стан — щоб не заходити в "Прийом з камер"/"Для мам" лише перевірити.
  const ftp = ftpStatus();
  const { data: globalSettings } = await supabase
    .from("global_settings")
    .select("mom_links_globally_disabled")
    .single();
  const momLinksActive = !globalSettings?.mom_links_globally_disabled;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <StatusChip status={ftp.running ? "active" : "off"}>
          {ftp.running ? "📡 Прийом з камер: увімкнено" : "📡 Прийом з камер: вимкнено"}
        </StatusChip>
        <StatusChip status={momLinksActive ? "active" : "off"}>
          {momLinksActive ? "💌 Посилання для мам: активні" : "💌 Посилання для мам: вимкнено глобально"}
        </StatusChip>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <Card menu={false}>
          <div className="text-[30px] font-extrabold text-purple-deep">{classes?.length ?? 0}</div>
          <div className="text-xs font-semibold text-ink-soft">Активних класів</div>
        </Card>
        <Card menu={false}>
          <div className="text-[30px] font-extrabold text-purple-deep">{totalStudents}</div>
          <div className="text-xs font-semibold text-ink-soft">Учнів у роботі</div>
        </Card>
        <Card menu={false}>
          <div className="text-[30px] font-extrabold text-ink">{totalStaff}</div>
          <div className="text-xs font-semibold text-ink-soft">Персоналу (не рахується у фінансах)</div>
        </Card>
        <Card menu={false}>
          <div className="text-[30px] font-extrabold text-purple-deep">
            {totalStudents ? `${avgPercent}%` : "—"}
          </div>
          <div className="text-xs font-semibold text-ink-soft">Середній прогрес відбору</div>
        </Card>
      </div>

      <Card title="Фінанси" menu={false} className="mb-4">
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
          <div>
            <div className="text-[22px] font-extrabold text-purple-deep">{potentialRevenue.toLocaleString("uk-UA")} ₴</div>
            <div className="text-xs font-semibold text-ink-soft">Потенційний дохід</div>
          </div>
          <div>
            <div className="text-[22px] font-extrabold text-ok">{paidRevenue.toLocaleString("uk-UA")} ₴</div>
            <div className="text-xs font-semibold text-ink-soft">Оплачено</div>
          </div>
          <div>
            <div className="text-[22px] font-extrabold text-ink">{paidCost.toLocaleString("uk-UA")} ₴</div>
            <div className="text-xs font-semibold text-ink-soft">Собівартість (оплачені)</div>
          </div>
          <div>
            <div className="text-[22px] font-extrabold text-purple-deep">{profit.toLocaleString("uk-UA")} ₴</div>
            <div className="text-xs font-semibold text-ink-soft">Прибуток</div>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-ink-soft">
          Потенційний дохід — ціна × кількість учнів (без урахування статусу оплати, крім
          "Безкоштовно" — ці екземпляри повністю поза фінансовою статистикою). Прибуток —
          оплачено мінус собівартість лише вже оплачених екземплярів.
        </p>

        <div className="mt-4 border-t border-line pt-3.5">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-soft">
            Хто на якому етапі — {financeStudents?.length ?? 0} учнів
          </div>
          <div className="flex flex-wrap gap-2">
            {(["not_ordered", "ordered", "partially_paid", "paid", "free"] as const).map((status) => (
              <span
                key={status}
                className={`rounded-full px-3 py-1.5 text-[12.5px] font-bold ${ORDER_STATUS_STYLE[status]}`}
              >
                {ORDER_STATUS_LABEL[status]}: {orderCounts[status]}
              </span>
            ))}
          </div>
        </div>
      </Card>

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
                {c.staffTotal > 0 && ` · персоналу: ${c.staffTotal}`}
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
