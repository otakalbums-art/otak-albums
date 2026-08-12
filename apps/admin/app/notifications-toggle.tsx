"use client";

import { useEffect, useState } from "react";
import { Toggle } from "@otak/ui";

// applicationServerKey потрібен як Uint8Array, а VAPID public key приходить
// у base64url — стандартне перетворення (немає готового в браузерному API).
function urlBase64ToUint8Array(base64Url: string) {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/**
 * Увімкнення/вимкнення push-сповіщень на цьому пристрої/браузері.
 * Стан читається з реального PushManager при монтуванні (не з
 * локального useState) — щоб коректно відображати, чи цей конкретний
 * браузер уже підписаний, а не просто "чи натискали колись кнопку".
 * На iOS працює лише якщо адмінку додано на головний екран
 * (apps/admin/app/manifest.ts) — у звичайній вкладці Safari Push API
 * недоступний.
 */
export function NotificationsToggle() {
  const [supported, setSupported] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testSent, setTestSent] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setSupported(false);
      return;
    }
    navigator.serviceWorker.register("/sw.js").then(async (reg) => {
      const existing = await reg.pushManager.getSubscription();
      setSubscribed(!!existing);
    });
  }, []);

  async function subscribe() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setBusy(false);
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      });
      const json = sub.toJSON();
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      setSubscribed(true);
    } finally {
      setBusy(false);
    }
  }

  async function unsubscribe() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    await fetch("/api/push/test", { method: "POST" });
    setTestSent(true);
    setTimeout(() => setTestSent(false), 2000);
  }

  if (!supported) return null;

  return (
    <div className="mt-1.5 flex flex-col gap-1.5 border-t border-line pt-1.5 md:mt-0">
      <div className="flex items-center justify-between gap-2 px-2.5 py-1">
        <span className="text-[11.5px] font-semibold text-ink-soft">Сповіщення</span>
        <Toggle
          checked={subscribed}
          onChange={(v) => (v ? subscribe() : unsubscribe())}
          aria-label="Push-сповіщення на цьому пристрої"
        />
      </div>
      {subscribed && (
        <button
          onClick={sendTest}
          disabled={busy}
          className="mx-2.5 rounded-lg border border-line px-2.5 py-1.5 text-left text-[11px] font-semibold text-ink-soft hover:bg-page"
        >
          {testSent ? "✓ Надіслано" : "Надіслати тестове"}
        </button>
      )}
    </div>
  );
}
