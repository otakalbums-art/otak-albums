import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { broadcastClassChange } from "@otak/supabase/cabinet";

/** Сповістити CRM і кабінети батьків про зміну даних дитини (шукає її клас). */
export async function broadcastStudentChange(studentId: string) {
  const service = createSupabaseServiceRoleClient();
  const { data } = await service.from("students").select("class_id").eq("id", studentId).maybeSingle();
  if (data?.class_id) await broadcastClassChange(data.class_id);
}

export { broadcastClassChange };
