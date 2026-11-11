import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { requireAdmin } from "@/lib/require-admin";

/**
 * PATCH /api/classes/[classId] — перенести клас в архів або повернути з нього.
 * Body: { archived: boolean }
 *
 * Архів = клас неактивний, але всі дані (учні, фото, CRM) зберігаються:
 *  - вхід за реферальним посиланням уже блокується для status='archived'
 *    (apps/client/app/login/[referralCode], api/auth/login);
 *  - уже залогінених учнів розлогінюємо (session_token = null), бо клієнтські
 *    API перевіряють лише сесію, а не статус класу;
 *  - посилання для мам архівного класу не відкриваються (mom-link/[token]);
 *  - FTP-прийом і так бере лише активні класи.
 * Повернення з архіву ставить status='active'; учні просто заходять заново.
 */
export async function PATCH(req: Request, { params }: { params: { classId: string } }) {
  const user = await requireAdmin("classes");
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const { archived } = await req.json();
  if (typeof archived !== "boolean") return NextResponse.json({ error: "Невірний запит" }, { status: 400 });

  const service = createSupabaseServiceRoleClient();
  const { error } = await service
    .from("classes")
    .update({ status: archived ? "archived" : "active" })
    .eq("id", params.classId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (archived) {
    await service.from("students").update({ session_token: null } as never).eq("class_id", params.classId);
  }

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/classes/[classId] — видалити клас остаточно.
 * Body: { confirmName } — має збігатися з назвою класу (захист від випадкового кліку).
 *
 * Спершу видаляємо файли фото зі Storage (bucket "photos"), потім рядок класу —
 * учні, фото, CRM-дані, посилання для мам видаляються каскадом у БД.
 */
export async function DELETE(req: Request, { params }: { params: { classId: string } }) {
  const user = await requireAdmin("classes");
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const { confirmName } = await req.json().catch(() => ({}));
  const service = createSupabaseServiceRoleClient();

  const { data: klass } = await service.from("classes").select("id, name").eq("id", params.classId).maybeSingle();
  if (!klass) return NextResponse.json({ error: "Клас не знайдено" }, { status: 404 });
  if (typeof confirmName !== "string" || confirmName.trim() !== klass.name.trim()) {
    return NextResponse.json({ error: "Назва класу не збігається — видалення скасовано" }, { status: 400 });
  }

  const { data: photos, error: photosError } = await service
    .from("photos")
    .select("storage_path")
    .eq("class_id", params.classId);
  if (photosError) return NextResponse.json({ error: photosError.message }, { status: 400 });

  // Видаляємо і файли з таблиці photos, і все, що лежить у папці класу
  // ({classId}/...) — туди могли потрапити файли без рядка в БД (обірване
  // завантаження), і вони б залишились назавжди.
  const folderPaths = await listFolderRecursive(service, params.classId);
  const paths = Array.from(new Set([...(photos ?? []).map((p) => p.storage_path).filter(Boolean), ...folderPaths]));

  // Storage приймає до 1000 шляхів за раз.
  for (let i = 0; i < paths.length; i += 1000) {
    const { error } = await service.storage.from("photos").remove(paths.slice(i, i + 1000));
    if (error) {
      return NextResponse.json(
        { error: `Не вдалося видалити файли фото: ${error.message}. Клас не видалено — спробуйте ще раз.` },
        { status: 500 }
      );
    }
  }

  const { error } = await service.from("classes").delete().eq("id", params.classId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, deletedFiles: paths.length });
}

/** Усі файли під prefix у bucket "photos" (Storage list не рекурсивний — обходимо папки самі). */
async function listFolderRecursive(
  service: ReturnType<typeof createSupabaseServiceRoleClient>,
  prefix: string
): Promise<string[]> {
  const files: string[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await service.storage.from("photos").list(prefix, { limit: PAGE, offset });
    if (error || !data) break;
    for (const item of data) {
      const full = `${prefix}/${item.name}`;
      // Папки повертаються без id; файли — з id.
      if (item.id) files.push(full);
      else files.push(...(await listFolderRecursive(service, full)));
    }
    if (data.length < PAGE) break;
  }
  return files;
}
