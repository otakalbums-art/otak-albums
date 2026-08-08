import { createSupabaseServerClient } from "@otak/supabase/server";
import { ftpCredentialsForClass } from "@/lib/ftp-credentials";
import { FtpControlPanel } from "./ftp-control-panel";

/**
 * Прийом фото з Wi-Fi камер по FTP — дружній UI: перемикач старт/стоп
 * (керує окремим процесом через /api/ftp/*, apps/admin/lib/ftp-process-manager.ts),
 * вибір класу й кількості камер кнопками, копіювання креденшлів без
 * виділення тексту, живий лічильник прийнятих фото.
 * Сам приймач — apps/admin/scripts/ftp-ingest.mjs, докладно про
 * налаштування конкретних камер — docs/camera-ftp-ingest.md.
 */
export default async function FtpImportPage() {
  const supabase = createSupabaseServerClient();
  const { data: classes } = await supabase
    .from("classes")
    .select("id, name, schools(name)")
    .eq("status", "active")
    .order("name");

  const classOptions = (classes ?? []).map((c: any) => ({
    id: c.id,
    name: c.name,
    schoolName: c.schools?.name ?? "",
  }));

  const credentialsByClassId = Object.fromEntries(
    classOptions.map((c) => [c.id, ftpCredentialsForClass(c.id)])
  );

  return <FtpControlPanel classes={classOptions} credentialsByClassId={credentialsByClassId} />;
}
