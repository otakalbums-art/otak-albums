"use client";

import { useEffect, useState } from "react";
import { Card, Button } from "@otak/ui";
import { ADMIN_TABS } from "@/lib/admin-tabs";
import { RoleForm } from "./role-form";

type Role = { id: string; name: string; tab_keys: string[]; is_owner: boolean };
type AdminUser = {
  id: string;
  fullName: string | null;
  email: string | null;
  createdAt: string;
  roleId: string;
  roleName: string;
  isOwner: boolean;
};

function tabLabels(keys: string[]) {
  return ADMIN_TABS.filter((t) => keys.includes(t.key)).map((t) => t.label);
}

/**
 * "Користувачі та ролі" — сторінка лише для власників (requireOwner()
 * на бекенді, middleware.ts взагалі не пускає сюди звичайні ролі — не
 * питання лише UI). Ролі: довільна назва + чекбокси вкладок
 * (apps/admin/lib/admin-tabs.ts — те саме джерело, що й бічне меню).
 * Користувачі: створення видає тимчасовий пароль ОДИН раз — далі він
 * ніде не зберігається у відкритому вигляді, лише в Supabase Auth.
 */
export default function UsersPage() {
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);

  const [newFullName, setNewFullName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRoleId, setNewRoleId] = useState("");
  const [creatingUser, setCreatingUser] = useState(false);
  const [createUserError, setCreateUserError] = useState<string | null>(null);
  const [lastCreated, setLastCreated] = useState<{ email: string; tempPassword: string } | null>(null);
  const [copied, setCopied] = useState(false);

  function refetchRoles() {
    return fetch("/api/admin-roles")
      .then((r) => r.json())
      .then((d) => setRoles(d.roles ?? []))
      .catch(() => {});
  }
  function refetchUsers() {
    return fetch("/api/admin-users")
      .then((r) => r.json())
      .then((d) => {
        setUsers(d.users ?? []);
        setCurrentUserId(d.currentUserId ?? null);
      })
      .catch(() => {});
  }

  useEffect(() => {
    refetchRoles();
    refetchUsers();
  }, []);

  const ownersCount = (users ?? []).filter((u) => u.isOwner).length;
  const usersByRole = (roles ?? []).map((r) => ({
    ...r,
    userCount: (users ?? []).filter((u) => u.roleId === r.id).length,
  }));

  async function handleCreateRole(value: { name: string; tab_keys: string[] }) {
    const res = await fetch("/api/admin-roles", { method: "POST", body: JSON.stringify({ name: value.name, tabKeys: value.tab_keys }) });
    const data = await res.json();
    if (!res.ok) return data.error ?? "Не вдалося створити роль";
    await refetchRoles();
  }

  async function handleEditRole(roleId: string, value: { name: string; tab_keys: string[] }) {
    const res = await fetch(`/api/admin-roles/${roleId}`, { method: "PATCH", body: JSON.stringify({ name: value.name, tabKeys: value.tab_keys }) });
    const data = await res.json();
    if (!res.ok) return data.error ?? "Не вдалося зберегти";
    setEditingRoleId(null);
    await refetchRoles();
  }

  async function deleteRole(id: string, name: string) {
    if (!confirm(`Видалити роль "${name}"?`)) return;
    const res = await fetch(`/api/admin-roles/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.error ?? "Не вдалося видалити роль");
      return;
    }
    await refetchRoles();
  }

  async function createUser() {
    setCreateUserError(null);
    setCreatingUser(true);
    const res = await fetch("/api/admin-users", {
      method: "POST",
      body: JSON.stringify({ fullName: newFullName, email: newEmail, roleId: newRoleId }),
    });
    const data = await res.json();
    setCreatingUser(false);
    if (!res.ok) {
      setCreateUserError(data.error ?? "Не вдалося створити користувача");
      return;
    }
    setLastCreated({ email: data.user.email, tempPassword: data.tempPassword });
    setNewFullName("");
    setNewEmail("");
    setNewRoleId("");
    await refetchUsers();
  }

  async function changeUserRole(userId: string, roleId: string) {
    setUsers((prev) => prev?.map((u) => (u.id === userId ? { ...u, roleId } : u)) ?? null);
    const res = await fetch(`/api/admin-users/${userId}`, { method: "PATCH", body: JSON.stringify({ roleId }) });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.error ?? "Не вдалося змінити роль");
    }
    await refetchUsers();
  }

  async function deleteUser(id: string, name: string) {
    if (!confirm(`Видалити користувача "${name}"? Він втратить доступ до адмін-панелі назавжди.`)) return;
    const res = await fetch(`/api/admin-users/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.error ?? "Не вдалося видалити користувача");
      return;
    }
    await refetchUsers();
  }

  async function copyTempPassword() {
    if (!lastCreated) return;
    await navigator.clipboard.writeText(lastCreated.tempPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div>
      <h1 className="mb-4 text-lg font-bold">Користувачі та ролі</h1>

      <Card title="Ролі" menu={false} className="mb-4">
        <RoleForm onSave={handleCreateRole} />
        <div className="flex flex-col gap-2.5">
          {usersByRole.map((role) =>
            editingRoleId === role.id ? (
              <RoleForm
                key={role.id}
                initial={{ name: role.name, tab_keys: role.tab_keys }}
                onSave={(value) => handleEditRole(role.id, value)}
                onCancel={() => setEditingRoleId(null)}
              />
            ) : (
              <div key={role.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-3">
                <div>
                  <div className="flex items-center gap-2 text-[13px] font-bold">
                    {role.name}
                    {role.is_owner && (
                      <span className="rounded-full bg-purple-pale px-2 py-0.5 text-[10px] font-bold text-purple-deep">
                        Власник — повний доступ
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {role.is_owner ? (
                      <span className="text-[11px] text-ink-soft">усі вкладки, завжди</span>
                    ) : tabLabels(role.tab_keys).length > 0 ? (
                      tabLabels(role.tab_keys).map((label) => (
                        <span key={label} className="rounded-md bg-page px-1.5 py-0.5 text-[10.5px] text-ink-soft">
                          {label}
                        </span>
                      ))
                    ) : (
                      <span className="text-[11px] text-ink-soft">жодної вкладки не обрано</span>
                    )}
                  </div>
                  <div className="mt-1 text-[10.5px] text-ink-soft">
                    {role.userCount} {role.userCount === 1 ? "користувач" : "користувачів"}
                  </div>
                </div>
                {!role.is_owner && (
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setEditingRoleId(role.id)}
                      className="rounded-[6px] border border-line bg-page px-2 py-1 text-[11px] font-semibold text-ink hover:border-purple"
                    >
                      Редагувати
                    </button>
                    <button
                      onClick={() => deleteRole(role.id, role.name)}
                      disabled={role.userCount > 0}
                      title={role.userCount > 0 ? "Спершу перепризначте користувачів з цією роллю" : undefined}
                      className="rounded-[6px] border border-line bg-page px-2 py-1 text-[11px] font-semibold text-ink-soft hover:border-red-300 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Видалити
                    </button>
                  </div>
                )}
              </div>
            )
          )}
          {roles !== null && roles.length === 0 && <p className="text-sm text-ink-soft">Ролей ще немає.</p>}
        </div>
      </Card>

      <Card title="Користувачі (адміни)" menu={false}>
        <div className="mb-3.5 flex flex-wrap items-end gap-2.5 border-b border-line pb-3.5">
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-ink-soft">Ім'я</label>
            <input
              value={newFullName}
              onChange={(e) => setNewFullName(e.target.value)}
              placeholder="Ірина Ковальчук"
              className="rounded-[9px] border border-line px-2.5 py-1.5 text-xs outline-none focus:border-purple"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-ink-soft">Email</label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="irina@example.com"
              className="rounded-[9px] border border-line px-2.5 py-1.5 text-xs outline-none focus:border-purple"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-ink-soft">Роль</label>
            <select
              value={newRoleId}
              onChange={(e) => setNewRoleId(e.target.value)}
              className="rounded-[9px] border border-line px-2.5 py-1.5 text-xs outline-none focus:border-purple"
            >
              <option value="">— Оберіть роль —</option>
              {(roles ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <Button size="sm" onClick={createUser} disabled={!newFullName.trim() || !newEmail.trim() || !newRoleId || creatingUser}>
            {creatingUser ? "Створюємо…" : "+ Додати користувача"}
          </Button>
        </div>
        {createUserError && <p className="mb-3 text-[12.5px] font-semibold text-warn">{createUserError}</p>}

        {lastCreated && (
          <div className="mb-3.5 rounded-[10px] border border-purple-soft bg-purple-pale p-3.5">
            <p className="mb-1.5 text-[12.5px] font-bold text-purple-deep">
              Акаунт для {lastCreated.email} створено — скопіюй пароль зараз, повторно він ніде не покажеться
            </p>
            <div className="flex items-center gap-1.5">
              <span className="rounded-md bg-white px-2.5 py-1.5 font-mono text-[13px]">{lastCreated.tempPassword}</span>
              <button
                onClick={copyTempPassword}
                className="rounded-[6px] border border-line bg-white px-1.5 py-1 text-[10.5px] font-bold text-purple hover:border-purple"
              >
                {copied ? "✓" : "📋"}
              </button>
              <button onClick={() => setLastCreated(null)} className="ml-2 text-[11px] text-ink-soft hover:underline">
                Приховати
              </button>
            </div>
          </div>
        )}

        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b-[1.5px] border-line text-left text-[11px] font-bold text-ink-soft">
              <th className="py-2">Ім'я</th>
              <th>Email</th>
              <th>Роль</th>
              <th>Створено</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(users ?? []).map((u) => (
              <tr key={u.id} className="border-b border-line">
                <td className="py-2.5">
                  {u.fullName ?? "—"}
                  {u.id === currentUserId && <span className="ml-1.5 text-[10.5px] text-ink-soft">(ви)</span>}
                </td>
                <td>{u.email ?? "—"}</td>
                <td>
                  {u.isOwner ? (
                    <span className="text-[12.5px] font-semibold">{u.roleName}</span>
                  ) : (
                    <select
                      value={u.roleId}
                      onChange={(e) => changeUserRole(u.id, e.target.value)}
                      className="rounded-md border border-line px-1.5 py-1 text-xs outline-none focus:border-purple"
                    >
                      {(roles ?? [])
                        .filter((r) => !r.is_owner)
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                    </select>
                  )}
                </td>
                <td>{new Date(u.createdAt).toLocaleDateString("uk-UA")}</td>
                <td>
                  <button
                    onClick={() => deleteUser(u.id, u.fullName ?? u.email ?? "цього користувача")}
                    disabled={u.id === currentUserId || (u.isOwner && ownersCount <= 1)}
                    title={
                      u.id === currentUserId
                        ? "Не можна видалити самого себе"
                        : u.isOwner && ownersCount <= 1
                          ? "Це останній власник"
                          : undefined
                    }
                    className="rounded-[6px] border border-line bg-page px-2 py-1 text-[11px] font-semibold text-ink-soft hover:border-red-300 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Видалити
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users !== null && users.length === 0 && <p className="mt-3 text-sm text-ink-soft">Користувачів ще немає.</p>}
      </Card>
    </div>
  );
}
