import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { requireOwner } from "@/lib/require-admin";
import { notifyAdmins } from "@otak/push";

// Просте JS-фільтрування замість фільтра на embedded-таблиці в PostgREST
// (потребував би !inner + dot-notation .eq, менш очевидно надійний) —
// адмінів завжди мало, читання всього списку не проблема продуктивності.
async function countOwners(supabase: ReturnType<typeof createSupabaseServiceRoleClient>) {
  const { data } = await supabase.from("admin_users").select("id, admin_roles(is_owner)");
  return (data ?? []).filter((u: any) => u.admin_roles?.is_owner).length;
}

/**
 * PATCH /api/admin-users/[id] — змінити ім'я та/або роль адміна.
 * Заблоковано (400), якщо це останній власник, а нова роль — не власницька
 * (система назавжди лишилась би без жодного, хто керує користувачами/ролями).
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireOwner();
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const supabase = createSupabaseServiceRoleClient();

  const { data: target } = await supabase
    .from("admin_users")
    .select("id, full_name, admin_roles(name, is_owner)")
    .eq("id", params.id)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: "Користувача не знайдено" }, { status: 404 });

  const { fullName, roleId } = await req.json();
  const update: Record<string, unknown> = {};
  if (fullName !== undefined) {
    if (!fullName.trim()) return NextResponse.json({ error: "Вкажіть ім'я" }, { status: 400 });
    update.full_name = fullName.trim();
  }

  let newRoleName: string | null = null;
  if (roleId !== undefined) {
    const { data: newRole } = await supabase.from("admin_roles").select("name, is_owner").eq("id", roleId).maybeSingle();
    if (!newRole) return NextResponse.json({ error: "Роль не знайдено" }, { status: 400 });

    const wasOwner = !!(target as any).admin_roles?.is_owner;
    if (wasOwner && !newRole.is_owner) {
      const owners = await countOwners(supabase);
      if (owners <= 1) {
        return NextResponse.json({ error: "Це останній власник — спершу призначте власника комусь іншому" }, { status: 400 });
      }
    }
    update.role_id = roleId;
    newRoleName = newRole.name;
  }

  const { data: updated, error } = await supabase
    .from("admin_users")
    .update(update)
    .eq("id", params.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (newRoleName) {
    const oldRoleName = (target as any).admin_roles?.name ?? "—";
    notifyAdmins(supabase, {
      ownersOnly: true,
      excludeAdminId: user.id,
      title: "Роль користувача змінена",
      body: `${(target as any).full_name ?? "Користувач"}: ${oldRoleName} → ${newRoleName}`,
      url: "/users",
    }).catch((err) => console.error("[push] role change notify:", err));
  }

  return NextResponse.json({ user: updated });
}

/**
 * DELETE /api/admin-users/[id] — видалити адміна остаточно (Supabase Auth
 * акаунт + рядок admin_users через `on delete cascade`, вже наявний у
 * схемі, supabase/migrations/0001_init.sql). Заблоковано: видалення
 * самого себе, і видалення останнього власника.
 */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireOwner();
  if (!user) return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  if (params.id === user.id) {
    return NextResponse.json({ error: "Не можна видалити самого себе" }, { status: 400 });
  }

  const supabase = createSupabaseServiceRoleClient();

  const { data: target } = await supabase
    .from("admin_users")
    .select("id, admin_roles(is_owner)")
    .eq("id", params.id)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: "Користувача не знайдено" }, { status: 404 });

  if ((target as any).admin_roles?.is_owner) {
    const owners = await countOwners(supabase);
    if (owners <= 1) {
      return NextResponse.json({ error: "Це останній власник — його не можна видалити" }, { status: 400 });
    }
  }

  const { error } = await supabase.auth.admin.deleteUser(params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
