import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { randomUUID } from "crypto";
import { broadcastClassChange, groupSlots, parseQuestions, parseTimeGroups } from "@otak/supabase/cabinet";
import { requireAdmin } from "@/lib/require-admin";
import { slotKeySlug } from "@/lib/slugify";

const TIME_RE = /^\d{2}:\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * PATCH /api/classes/[classId]/settings — налаштування кабінету батьків.
 * Body (усі поля необов'язкові): { shootDate, timeGroups: [{id?, name, color, start, end, interval}],
 *   parentEditingEnabled, questions: [{key?, label}], albumTypeId }
 */
export async function PATCH(req: Request, { params }: { params: { classId: string } }) {
  const user = await requireAdmin(["crm", "classes"]);
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const body = await req.json();
  const update: Record<string, unknown> = {};

  if (body.shootDate !== undefined) {
    if (body.shootDate && !DATE_RE.test(body.shootDate)) return NextResponse.json({ error: "Невірна дата" }, { status: 400 });
    update.shoot_date = body.shootDate || null;
  }
  if (body.timeGroups !== undefined) {
    const raw: any[] = Array.isArray(body.timeGroups) ? body.timeGroups : [];
    for (const [i, g] of raw.entries()) {
      const n = i + 1;
      if (!TIME_RE.test(g?.start ?? "") || !TIME_RE.test(g?.end ?? "")) {
        return NextResponse.json({ error: `Група ${n}: вкажіть початок і кінець` }, { status: 400 });
      }
      if (g.start >= g.end) return NextResponse.json({ error: `Група ${n}: початок має бути раніше за кінець` }, { status: 400 });
      const interval = Number(g.interval);
      if (!Number.isInteger(interval) || interval < 1 || interval > 240) {
        return NextResponse.json({ error: `Група ${n}: хвилин на дитину — від 1 до 240` }, { status: 400 });
      }
    }
    const groups = parseTimeGroups(raw.map((g) => ({ ...g, id: g.id || randomUUID().slice(0, 8) })));
    const sorted = [...groups].sort((a, b) => a.start.localeCompare(b.start));
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].start < sorted[i - 1].end) {
        return NextResponse.json(
          { error: `Групи «${sorted[i - 1].name}» і «${sorted[i].name}» перетинаються в часі` },
          { status: 400 }
        );
      }
    }
    if (groups.some((g) => groupSlots(g).length === 0)) {
      return NextResponse.json({ error: "У кожній групі має бути хоча б один слот" }, { status: 400 });
    }
    update.time_groups = groups;
  }
  if (body.albumTypeId !== undefined) update.album_type_id = body.albumTypeId || null;
  if (body.parentEditingEnabled !== undefined) update.parent_editing_enabled = !!body.parentEditingEnabled;
  if (body.questions !== undefined) {
    // Ключ питання стабільний (до нього прив'язані відповіді); нове питання отримує ключ з назви.
    const used = new Set<string>();
    const questions = parseQuestions(
      (Array.isArray(body.questions) ? body.questions : []).map((q: any) => ({ key: q?.key || "", label: q?.label ?? "" }))
    ).map((q) => {
      let key = q.key || slotKeySlug(q.label) || "q";
      while (used.has(key)) key = `${key}_2`;
      used.add(key);
      return { key, label: q.label };
    });
    update.questions = questions;
  }

  const service = createSupabaseServiceRoleClient();
  const { error } = await service.from("classes").update(update as never).eq("id", params.classId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await broadcastClassChange(params.classId);
  return NextResponse.json({ ok: true });
}
