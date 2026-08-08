import { Card } from "@otak/ui";
import { createSupabaseServerClient } from "@otak/supabase/server";
import { ftpCredentialsForClass, lanIps } from "@/lib/ftp-credentials";

const FTP_PORT = Number(process.env.FTP_PORT || 2121);

/**
 * Прийом фото з Wi-Fi камер по FTP — креденшли на клас (детерміновані,
 * нічого не зберігається в БД), локальні IP для налаштування камери,
 * та статус секрету. Сам приймач — окремий процес, див.
 * apps/admin/scripts/ftp-ingest.mjs і docs/camera-ftp-ingest.md.
 */
export default async function FtpImportPage() {
  const supabase = createSupabaseServerClient();
  const { data: classes } = await supabase
    .from("classes")
    .select("id, name, schools(name)")
    .eq("status", "active")
    .order("name");

  const ips = lanIps();
  const secretConfigured = !!process.env.FTP_INGEST_SECRET;

  return (
    <div className="flex flex-col gap-4">
      <Card title="Прийом фото з Wi-Fi камер (FTP)" menu={false}>
        <p className="text-xs text-ink-soft">
          Комп'ютер, на якому запущена адмінка, і камера мають бути в{" "}
          <b>одній Wi-Fi мережі</b>. Приймач — окремий процес (не той, що обслуговує сайт):
        </p>
        <pre className="mt-2 rounded-[9px] bg-page px-3 py-2 font-mono text-[12px]">
          pnpm --filter admin run ftp:start
        </pre>
        <p className="mt-2 text-xs text-ink-soft">
          Поки процес запущений — фото, скинуті камерою в свою папку, автоматично зʼявляються
          в галереї учнів класу (без ручного завантаження, без оновлення сторінки).
        </p>

        {!secretConfigured && (
          <p className="mt-3 rounded-[9px] bg-purple-pale px-3 py-2 text-xs font-semibold text-purple-deep">
            ⚠ FTP_INGEST_SECRET не заданий у apps/admin/.env.local — приймач працює на dev-заглушці.
            Постав власний секрет перед реальною зйомкою (креденшли нижче тоді зміняться).
          </p>
        )}

        <div className="mt-3 rounded-[9px] border border-line p-3 text-xs">
          <div className="mb-1 font-bold">Host (IP цього комп'ютера в локальній мережі)</div>
          {ips.length === 0 && <p className="text-ink-soft">Не знайдено активних мережевих інтерфейсів.</p>}
          {ips.map((ip) => (
            <div key={ip.address} className="font-mono">
              {ip.address} <span className="text-ink-soft">({ip.name})</span>
            </div>
          ))}
          <div className="mt-1.5">
            Порт: <span className="font-mono font-bold">{FTP_PORT}</span> · Режим: пасивний (passive)
          </div>
        </div>
      </Card>

      <Card title="Креденшли по класах" menu={false}>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b-[1.5px] border-line text-left text-[11px] font-bold text-ink-soft">
              <th className="py-2">Клас</th>
              <th>Логін</th>
              <th>Пароль</th>
            </tr>
          </thead>
          <tbody>
            {(classes ?? []).map((c: any) => {
              const cred = ftpCredentialsForClass(c.id);
              return (
                <tr key={c.id} className="border-b border-line">
                  <td className="py-2.5">
                    {c.name}, {c.schools?.name}
                  </td>
                  <td className="font-mono text-[12px]">{cred.username}</td>
                  <td className="font-mono text-[12px]">{cred.password}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {(classes ?? []).length === 0 && (
          <p className="mt-2 text-xs text-ink-soft">
            Активних класів ще немає — створіть на вкладці «Класи та папки».
          </p>
        )}
        <p className="mt-3 text-xs text-ink-soft">
          Один логін на клас — його вистачає на всі камери цього класу одночасно. Кожна камера
          підключається тими самими креденшлами.
        </p>
      </Card>

      <Card title="Декілька камер в один клас — різні папки" menu={false}>
        <p className="text-xs text-ink-soft">
          Щоб кілька камер писали в різні "папки" одного класу — не потрібні окремі логіни:
          достатньо в налаштуваннях FTP <b>кожної камери окремо</b> вказати іншу{" "}
          <b>цільову папку (Directory / Target folder)</b>. Назва підпапки визначає категорію
          фото — той самий список, що й при ручному завантаженні:
        </p>
        <table className="mt-2.5 w-full text-[13px]">
          <thead>
            <tr className="border-b-[1.5px] border-line text-left text-[11px] font-bold text-ink-soft">
              <th className="py-2">Папка на камері (Directory)</th>
              <th>Категорія фото</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["/ (не вказувати взагалі)", "Без категорії"],
              ["/portrait", "Портрети"],
              ["/group", "Групові"],
              ["/ceremony", "Церемонія"],
              ["/personal", "Персональні (без прив'язки до учня — приєднати можна пізніше вручну)"],
            ].map(([folder, label]) => (
              <tr key={folder} className="border-b border-line">
                <td className="py-2 font-mono text-[12px]">{folder}</td>
                <td>{label}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-ink-soft">
          Детальні кроки для конкретних камер — <code className="font-mono">docs/camera-ftp-ingest.md</code>.
        </p>
      </Card>
    </div>
  );
}
