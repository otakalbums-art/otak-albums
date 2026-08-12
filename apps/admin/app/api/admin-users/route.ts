import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { requireOwner } from "@/lib/require-admin";
import { notifyAdmins } from "@otak/push";

/**
 * GET  /api/admin-users — список адмінів + назва їхньої ролі.
 * POST /api/admin-users — створити нового адміна { fullName, email, roleId }.
 *
 * Новий акаунт отримує випадковий тимчасовий пароль — власник копіює й
 * передає його новому адміну сам (месенджером тощо), система не покаже
 * пароль вдруге ніде (не зберігається в БД у відкритому вигляді — лише в
 * Supabase Auth, як для будь-якого пароля). Свідомо без email-запрошення:
 * не залежить від того, чи справно налаштована розсилка пошти Supabase на
 * цьому проєкті (див. supabase/migrations/0009_admin_roles.sql,
 * docs/auth-strategy.md).
 */
export async function GET() {
  const user = await requireOwner();
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const supabase = createSupabaseServiceRoleClient();
  const { data: users, error } = await supabase
    .from("admin_users")
    .select("id, full_name, created_at, role_id, admin_roles(name, is_owner)")
    .order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Email живе в auth.users, не в admin_users — тягнемо окремо через admin API.
  const { data: authList } = await supabase.auth.admin.listUsers();
  const emailById = new Map((authList?.users ?? []).map((u: any) => [u.id, u.email]));

  const mapped = (users ?? []).map((u: any) => ({
    id: u.id,
    fullName: u.full_name,
    email: emailById.get(u.id) ?? null,
    createdAt: u.created_at,
    roleId: u.role_id,
    roleName: u.admin_roles?.name ?? "—",
    isOwner: !!u.admin_roles?.is_owner,
  }));

  return NextResponse.json({ users: mapped, currentUserId: user.id });
}

export async function POST(req: Request) {
  const user = await requireOwner();
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const { fullName, email, roleId } = await req.json();
  if (!fullName?.trim()) return NextResponse.json({ error: "Вкажіть ім'я" }, { status: 400 });
  if (!email?.trim()) return NextResponse.json({ error: "Вкажіть email" }, { status: 400 });
  if (!roleId) return NextResponse.json({ error: "Оберіть роль" }, { status: 400 });

  const supabase = createSupabaseServiceRoleClient();

  const { data: role } = await supabase.from("admin_roles").select("id, name").eq("id", roleId).maybeSingle();
  if (!role) return NextResponse.json({ error: "Роль не знайдено" }, { status: 400 });

  const tempPassword = randomBytes(9).toString("base64url"); // ~12 символів, url-safe

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: email.trim(),
    password: tempPassword,
    email_confirm: true,
  });
  if (createError || !created.user) {
    return NextResponse.json({ error: createError?.message ?? "Не вдалося створити акаунт" }, { status: 400 });
  }

  const { error: insertError } = await supabase
    .from("admin_users")
    .insert({ id: created.user.id, full_name: fullName.trim(), role_id: roleId });
  if (insertError) {
    // Відкат — інакше лишається "сирітський" auth-акаунт без рядка admin_users.
    await supabase.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  notifyAdmins(supabase, {
    ownersOnly: true,
    excludeAdminId: user.id,
    title: "Новий адмін доданий",
    body: `${fullName.trim()} (${email.trim()}), роль: ${role.name}`,
    url: "/users",
  }).catch((err) => console.error("[push] new admin notify:", err));

  return NextResponse.json({
    user: { id: created.user.id, fullName: fullName.trim(), email: email.trim() },
    tempPassword,
  });
}
