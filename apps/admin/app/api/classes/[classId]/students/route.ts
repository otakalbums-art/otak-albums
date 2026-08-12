import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { requireAdmin } from "@/lib/require-admin";

/**
 * POST /api/classes/[classId]/students — додати учня (або персонал —
 * класний керівник/директор/своя посада) до класу.
 * Body: { firstName, lastName, staffRole? }
 * staffRole — конкретна посада ("Класний керівник", "Директор", будь-яка
 * своя) або відсутнє/порожнє для звичайного учня; is_staff — похідний
 * прапорець (true, коли staffRole задано), потрібен наявним запитам
 * сортування/фінансів (apps/admin/app/page.tsx,
 * apps/admin/app/api/classes/[classId]/crm/route.ts).
 */
export async function POST(req: Request, { params }: { params: { classId: string } }) {
  const user = await requireAdmin("crm");
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const { firstName, lastName, staffRole } = await req.json();
  if (!firstName?.trim() || !lastName?.trim()) {
    return NextResponse.json({ error: "Вкажіть прізвище та ім'я" }, { status: 400 });
  }

  const resolvedRole = staffRole?.trim() || null;

  const service = createSupabaseServiceRoleClient();
  const { data: student, error } = await service
    .from("students")
    .insert({
      class_id: params.classId,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      staff_role: resolvedRole,
      is_staff: !!resolvedRole,
    })
    .select("*")
    .single();

  if (error) {
    const message = error.code === "23505" ? "Учень з таким прізвищем та ім'ям уже є в класі" : error.message;
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ student });
}
