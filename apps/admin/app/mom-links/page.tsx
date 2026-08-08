"use client";

import { useEffect, useState } from "react";
import { Card, Toggle } from "@otak/ui";

type MomLink = {
  id: string;
  class_name: string;
  hours: number;
  expires_at: string | null;
  is_active: boolean;
};

/**
 * Керування посиланнями для мам: термін дії на клас, локальне вимкнення
 * (is_active в mom_links) і глобальне вимкнення (global_settings.mom_links_globally_disabled).
 */
export default function MomLinksPage() {
  const [links, setLinks] = useState<MomLink[]>([]);
  const [globalDisabled, setGlobalDisabled] = useState(false);

  useEffect(() => {
    fetch("/api/mom-links")
      .then((r) => r.json())
      .then((d) => {
        setLinks(d.links ?? []);
        setGlobalDisabled(!!d.globalDisabled);
      })
      .catch(() => {});
  }, []);

  async function toggleGlobal(next: boolean) {
    setGlobalDisabled(next);
    await fetch("/api/mom-links/global", { method: "POST", body: JSON.stringify({ disabled: next }) });
  }

  async function toggleLocal(id: string, next: boolean) {
    setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, is_active: next } : l)));
    await fetch(`/api/mom-links/${id}`, { method: "POST", body: JSON.stringify({ isActive: next }) });
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[15.5px] font-bold">Посилання для мам</h3>
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-semibold text-ink-soft">Вимкнути всі глобально</span>
          <Toggle checked={!globalDisabled} onChange={(v) => toggleGlobal(!v)} aria-label="Глобальний перемикач" />
        </div>
      </div>
      <Card menu={false}>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b-[1.5px] border-line text-left text-[11px] font-bold text-ink-soft">
              <th className="py-2">Клас</th>
              <th>Термін дії (год)</th>
              <th>Активне до</th>
              <th>Локально</th>
            </tr>
          </thead>
          <tbody>
            {links.map((l) => (
              <tr key={l.id} className="border-b border-line">
                <td className="py-2.5">{l.class_name}</td>
                <td>
                  <input
                    defaultValue={l.hours}
                    className="w-14 rounded-md border border-line px-1.5 py-1 font-mono text-xs"
                  />
                </td>
                <td>{l.expires_at ? new Date(l.expires_at).toLocaleString("uk-UA") : "—"}</td>
                <td>
                  <Toggle checked={l.is_active} onChange={(v) => toggleLocal(l.id, v)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="mt-3 text-xs text-ink-soft">
        Термін дії посилання задається адміном для кожного класу окремо. Перемикач вимикає
        доступ достроково — локально для одного класу або глобально для всіх одразу.
      </p>
    </div>
  );
}
