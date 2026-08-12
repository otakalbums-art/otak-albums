import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@otak/supabase";
import { randomBytes } from "crypto";
import { notifyAdmins } from "@otak/push";

/**
 * POST /api/auth/login
 * Body: { lastName, firstName, referralCode }
 *
 * Звіряє прізвище+ім'я з таблицею `students` у межах класу з referralCode.
 * При збігу видає session_token (30 днів) і ставить httpOnly cookie —
 * це замінює повноцінний Supabase Auth для учнів (див. docs/auth-strategy.md).
 */
export async function POST(req: Request) {
  const { lastName, firstName, referralCode } = await req.json();
  const supabase = createSupabaseServiceRoleClient();

  const { data: klass } = await supabase
    .from("classes")
    .select("id, name, status")
    .eq("referral_code", referralCode)
    .single();

  if (!klass || klass.status === "archived") {
    return NextResponse.json({ error: "Клас не знайдено або посилання неактивне" }, { status: 404 });
  }

  const { data: student } = await supabase
    .from("students")
    .select("id, first_name, last_name, first_login_at")
    .eq("class_id", klass.id)
    .ilike("last_name", lastName.trim())
    .ilike("first_name", firstName.trim())
    .single();

  if (!student) {
    return NextResponse.json(
      { error: "Не знайдено. Перевірте написання прізвища та імені або зверніться до відповідальної особи класу." },
      { status: 401 }
    );
  }

  const sessionToken = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const isFirstLogin = !student.first_login_at;

  const update: Record<string, unknown> = { session_token: sessionToken, session_expires_at: expiresAt.toISOString() };
  if (isFirstLogin) update.first_login_at = new Date().toISOString();

  await supabase.from("students").update(update).eq("id", student.id);

  if (isFirstLogin) {
    notifyAdmins(supabase, {
      tab: "crm",
      title: "Новий учень приєднався",
      body: `${student.last_name} ${student.first_name} (${klass.name}) вперше увійшов за посиланням класу`,
      url: `/classes/${klass.id}/crm`,
    }).catch((err) => console.error("[push] first-login notify:", err));
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("otak_session", sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
  return res;
}
