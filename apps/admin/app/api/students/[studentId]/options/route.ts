import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { requireAdmin } from "@/lib/require-admin";
import { broadcastStudentChange } from "@/lib/class-realtime";

/**
 * PUT /api/students/[studentId]/options — додаткова послуга дитини.
 * Body: { optionId, quantity } — quantity 0 прибирає послугу.
 * Ціна фіксується знімком з каталогу (album_options.price) при першому додаванні.
 */
export async function PUT(req: Request, { params }: { params: { studentId: string } }) {
  const user = await requireAdmin("crm");
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const { optionId, quantity } = await req.json();
  const qty = Number(quantity);
  if (typeof optionId !== "string" || !optionId || !Number.isInteger(qty) || qty < 0 || qty > 100) {
    return NextResponse.json({ error: "Невірна кількість" }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();

  if (qty === 0) {
    const { error } = await service
      .from("student_options")
      .delete()
      .eq("student_id", params.studentId)
      .eq("option_id", optionId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else {
    const { data: existing } = await service
      .from("student_options")
      .select("id")
      .eq("student_id", params.studentId)
      .eq("option_id", optionId)
      .maybeSingle();

    if (existing) {
      const { error } = await service.from("student_options").update({ quantity: qty }).eq("id", existing.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    } else {
      const { data: option } = await service.from("album_options").select("price").eq("id", optionId).maybeSingle();
      if (!option) return NextResponse.json({ error: "Послугу не знайдено" }, { status: 404 });
      const { error } = await service.from("student_options").insert({
        student_id: params.studentId,
        option_id: optionId,
        quantity: qty,
        unit_price: option.price,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  await broadcastStudentChange(params.studentId);
  return NextResponse.json({ ok: true });
}
