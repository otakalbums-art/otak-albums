import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createSupabaseServiceRoleClient } from "@otak/supabase";
import { notifyAdmins } from "@otak/push";

/**
 * GET /k/[token] — персональне посилання дитини (students.access_token).
 * Діє, доки дитину не видалили з класу (або клас не в архіві). Ставить ту
 * саму сесійну cookie, що й вхід за прізвищем, тож після нього працюють і
 * кабінет, і галерея, і формування альбому. Повторний перехід за
 * посиланням (інший телефон, PWA) просто відновлює сесію.
 */
const SESSION_DAYS = 365;

export async function GET(req: Request, { params }: { params: { token: string } }) {
  const supabase = createSupabaseServiceRoleClient();
  const { data: student } = await supabase
    .from("students")
    .select("id, first_name, last_name, session_token, first_login_at, classes(id, name, status)")
    .eq("access_token", params.token)
    .maybeSingle();

  const klass = (student as any)?.classes;
  if (!student || !klass || klass.status === "archived") {
    return NextResponse.redirect(new URL("/link-invalid", req.url));
  }

  // Наявну сесію не перезаписуємо — інакше вхід з другого телефона розлогінив би перший.
  const sessionToken = student.session_token ?? randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const isFirstLogin = !student.first_login_at;

  const update: Record<string, unknown> = { session_token: sessionToken, session_expires_at: expiresAt.toISOString() };
  if (isFirstLogin) update.first_login_at = new Date().toISOString();
  await supabase.from("students").update(update as never).eq("id", student.id);

  if (isFirstLogin) {
    notifyAdmins(supabase, {
      tab: "crm",
      title: "Батьки відкрили кабінет",
      body: `${student.last_name} ${student.first_name} (${klass.name}) — вперше за персональним посиланням`,
      url: `/classes/${klass.id}/crm`,
    }).catch((err) => console.error("[push] first-login notify:", err));
  }

  const res = NextResponse.redirect(new URL("/cabinet", req.url));
  res.cookies.set("otak_session", sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
  return res;
}
