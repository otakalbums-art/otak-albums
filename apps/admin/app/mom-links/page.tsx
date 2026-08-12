"use client";

import { useEffect, useState } from "react";
import { Card, Toggle, Button } from "@otak/ui";
import { ReferralLinkCell } from "../classes/referral-link-cell";

type MomLink = {
  id: string;
  token: string;
  class_name: string;
  hours: number;
  expires_at: string | null;
  is_active: boolean;
};

type ClassOption = { id: string; name: string };

// Клієнтський застосунок, apps/client/app/mom-link/[token]/page.tsx — публічний
// перегляд фото класу без входу, лише за токеном у URL.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/** Термін дії, редагований прямо в рядку — зберігає лише при явному кліку "✓". */
function HoursCell({ id, hours, onSaved }: { id: string; hours: number; onSaved: () => void }) {
  const [value, setValue] = useState(String(hours));
  const [saving, setSaving] = useState(false);

  useEffect(() => setValue(String(hours)), [hours]);

  const dirty = value !== String(hours) && Number(value) > 0;

  async function save() {
    setSaving(true);
    await fetch(`/api/mom-links/${id}`, { method: "PATCH", body: JSON.stringify({ hours: Number(value) }) });
    setSaving(false);
    onSaved();
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        min={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-14 rounded-md border border-line px-1.5 py-1 font-mono text-xs"
      />
      {dirty && (
        <button
          onClick={save}
          disabled={saving}
          aria-label="Зберегти новий термін дії"
          className="flex-shrink-0 rounded-[6px] border border-line bg-page px-1.5 py-1 text-[10.5px] font-bold text-purple hover:border-purple"
        >
          {saving ? "…" : "✓"}
        </button>
      )}
    </div>
  );
}

/**
 * Керування посиланнями для мам: термін дії на клас, локальне вимкнення
 * (is_active в mom_links) і глобальне вимкнення (global_settings.mom_links_globally_disabled).
 */
export default function MomLinksPage() {
  const [links, setLinks] = useState<MomLink[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [globalDisabled, setGlobalDisabled] = useState(false);
  const [newClassId, setNewClassId] = useState("");
  const [newHours, setNewHours] = useState("72");
  const [creating, setCreating] = useState(false);

  function refetch() {
    return fetch("/api/mom-links")
      .then((r) => r.json())
      .then((d) => {
        setLinks(d.links ?? []);
        setClasses(d.classes ?? []);
        setGlobalDisabled(!!d.globalDisabled);
      })
      .catch(() => {});
  }

  useEffect(() => {
    refetch();
  }, []);

  async function toggleGlobal(next: boolean) {
    setGlobalDisabled(next);
    await fetch("/api/mom-links/global", { method: "POST", body: JSON.stringify({ disabled: next }) });
  }

  async function toggleLocal(id: string, next: boolean) {
    setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, is_active: next } : l)));
    await fetch(`/api/mom-links/${id}`, { method: "POST", body: JSON.stringify({ isActive: next }) });
  }

  async function deleteLink(id: string, className: string) {
    if (!confirm(`Видалити посилання для класу "${className}" остаточно? Стара URL перестане працювати одразу.`)) return;
    setLinks((prev) => prev.filter((l) => l.id !== id));
    await fetch(`/api/mom-links/${id}`, { method: "DELETE" });
  }

  async function createLink() {
    if (!newClassId || !newHours) return;
    setCreating(true);
    await fetch("/api/mom-links", {
      method: "POST",
      body: JSON.stringify({ classId: newClassId, hours: Number(newHours) }),
    });
    setCreating(false);
    await refetch();
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[15.5px] font-bold">Посилання для мам</h3>
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-semibold text-ink-soft">Посилання активні глобально</span>
          <Toggle checked={!globalDisabled} onChange={(v) => toggleGlobal(!v)} aria-label="Глобальний перемикач" />
        </div>
      </div>
      <Card menu={false}>
        <div className="mb-3.5 flex flex-wrap items-end gap-2.5 border-b border-line pb-3.5">
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-ink-soft">Клас</label>
            <select
              value={newClassId}
              onChange={(e) => setNewClassId(e.target.value)}
              className="rounded-[9px] border border-line px-2.5 py-1.5 text-xs outline-none focus:border-purple"
            >
              <option value="">— Оберіть клас —</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-ink-soft">Термін дії (год)</label>
            <input
              type="number"
              min={1}
              value={newHours}
              onChange={(e) => setNewHours(e.target.value)}
              className="w-20 rounded-[9px] border border-line px-2.5 py-1.5 text-xs outline-none focus:border-purple"
            />
          </div>
          <Button size="sm" onClick={createLink} disabled={!newClassId || creating}>
            {creating ? "Створюємо…" : "+ Створити посилання"}
          </Button>
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b-[1.5px] border-line text-left text-[11px] font-bold text-ink-soft">
              <th className="py-2">Клас</th>
              <th>Посилання</th>
              <th>Термін дії (год)</th>
              <th>Активне до</th>
              <th title="Вмикає/вимикає лише це одне посилання, не чіпаючи решту">Це посилання</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {links.map((l) => (
              <tr key={l.id} className="border-b border-line">
                <td className="py-2.5">{l.class_name}</td>
                <td>
                  <ReferralLinkCell url={`${SITE_URL}/mom-link/${l.token}`} />
                </td>
                <td>
                  <HoursCell id={l.id} hours={l.hours} onSaved={refetch} />
                </td>
                <td>{l.expires_at ? new Date(l.expires_at).toLocaleString("uk-UA") : "—"}</td>
                <td>
                  <Toggle checked={l.is_active} onChange={(v) => toggleLocal(l.id, v)} />
                </td>
                <td>
                  <button
                    onClick={() => deleteLink(l.id, l.class_name)}
                    aria-label="Видалити посилання"
                    title="Видалити посилання остаточно"
                    className="rounded-[6px] border border-line bg-page px-1.5 py-1 text-[10.5px] font-bold text-ink-soft hover:border-red-300 hover:text-red-600"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="mt-3 text-xs text-ink-soft">
        Термін дії посилання задається адміном для кожного класу окремо. Перемикач «Це
        посилання» в рядку вимикає достроково лише цей один рядок — інші класи й далі
        працюють. Перемикач «Посилання активні глобально» вгорі — аварійний рубильник:
        вимикає одразу геть усі посилання для мам, незалежно від їхнього власного стану.
      </p>
    </div>
  );
}
