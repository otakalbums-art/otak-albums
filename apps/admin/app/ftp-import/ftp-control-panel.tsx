"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, Toggle } from "@otak/ui";
import { createSupabaseBrowserClient } from "@otak/supabase/browser";

type ClassOption = { id: string; name: string; schoolName: string };
type Creds = { username: string; password: string };

const CATEGORY_SLOTS: { key: string; label: string; emoji: string }[] = [
  { key: "portrait", label: "Портрети", emoji: "📷" },
  { key: "group", label: "Групові", emoji: "👥" },
  { key: "ceremony", label: "Церемонія", emoji: "🎓" },
  { key: "personal", label: "Персональні", emoji: "🙂" },
  { key: "uncategorized", label: "Без категорії", emoji: "📁" },
];

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold text-ink-soft">{label}</div>
      <button
        onClick={copy}
        className="flex w-full items-center justify-between gap-2 rounded-[9px] border border-line bg-page px-3 py-2 text-left font-mono text-[13px] hover:border-purple"
      >
        <span className="truncate">{value}</span>
        <span className="flex-shrink-0 text-[11px] font-bold text-purple">
          {copied ? "✓ Скопійовано" : "📋 Копіювати"}
        </span>
      </button>
    </div>
  );
}

export function FtpControlPanel({
  classes,
  credentialsByClassId,
}: {
  classes: ClassOption[];
  credentialsByClassId: Record<string, Creds>;
}) {
  // --- статус приймача (poll кожні 3с) ---
  const [status, setStatus] = useState<{ running: boolean; ips: { address: string; name: string }[]; port: number; logs: string[] } | null>(
    null
  );
  const [busy, setBusy] = useState(false);

  async function refreshStatus() {
    const res = await fetch("/api/ftp/status");
    if (res.ok) setStatus(await res.json());
  }

  useEffect(() => {
    refreshStatus();
    const id = setInterval(refreshStatus, 3000);
    return () => clearInterval(id);
  }, []);

  async function toggleServer(next: boolean) {
    setBusy(true);
    await fetch(next ? "/api/ftp/start" : "/api/ftp/stop", { method: "POST" });
    await refreshStatus();
    setBusy(false);
  }

  // --- вибір класу + кількість камер (запам'ятовуємо в браузері) ---
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [cameraCount, setCameraCount] = useState(1);

  useEffect(() => {
    const savedClass = localStorage.getItem("ftp-selected-class");
    const savedCount = Number(localStorage.getItem("ftp-camera-count"));
    if (savedClass && classes.some((c) => c.id === savedClass)) setSelectedClassId(savedClass);
    else if (classes[0]) setSelectedClassId(classes[0].id);
    if (savedCount >= 1 && savedCount <= 5) setCameraCount(savedCount);
  }, [classes]);

  useEffect(() => {
    if (selectedClassId) localStorage.setItem("ftp-selected-class", selectedClassId);
  }, [selectedClassId]);
  useEffect(() => {
    localStorage.setItem("ftp-camera-count", String(cameraCount));
  }, [cameraCount]);

  // --- лічильник щойно прийнятих фото (реал-тайм, з моменту відкриття сторінки) ---
  const [receivedCount, setReceivedCount] = useState(0);
  useEffect(() => {
    setReceivedCount(0);
    if (!selectedClassId) return;
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`ftp-received-${selectedClassId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "photos", filter: `class_id=eq.${selectedClassId}` },
        () => setReceivedCount((n) => n + 1)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedClassId]);

  const creds = selectedClassId ? credentialsByClassId[selectedClassId] : null;
  const primaryIp = status?.ips[0]?.address;
  const visibleSlots = useMemo(() => CATEGORY_SLOTS.slice(0, cameraCount), [cameraCount]);

  return (
    <div className="flex flex-col gap-4">
      <Card title="Прийом фото з Wi-Fi камер" menu={false}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-bold ${
                status?.running ? "bg-[#E7F7EE] text-ok" : "bg-line text-ink-soft"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${status?.running ? "bg-ok" : "bg-ink-soft"}`} />
              {status === null ? "Перевіряємо…" : status.running ? "Прийом увімкнено" : "Прийом вимкнено"}
            </span>
            {busy && <span className="text-xs text-ink-soft">⏳ Секунду…</span>}
          </div>
          <Toggle
            checked={!!status?.running}
            onChange={(next) => toggleServer(next)}
            aria-label="Увімкнути/вимкнути прийом фото"
          />
        </div>

        {status?.running && primaryIp && (
          <p className="mt-3 text-xs text-ink-soft">
            Комп'ютер і камера мають бути в одній Wi-Fi мережі. Адреса комп'ютера:{" "}
            <b className="font-mono text-ink">{primaryIp}</b>, порт <b className="font-mono text-ink">{status.port}</b>.
          </p>
        )}

        {!status?.running && (
          <p className="mt-3 text-xs text-ink-soft">
            Натисни перемикач, щоб увімкнути прийом — тоді камери зможуть підключатись.
          </p>
        )}

        {status && status.logs.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-[11px] font-semibold text-ink-soft">Технічний лог</summary>
            <pre className="mt-1.5 max-h-[140px] overflow-y-auto rounded-[9px] bg-page p-2 font-mono text-[10.5px] leading-relaxed text-ink-soft">
              {status.logs.join("\n")}
            </pre>
          </details>
        )}
      </Card>

      {classes.length === 0 ? (
        <Card menu={false}>
          <p className="text-sm text-ink-soft">Активних класів ще немає — створіть на вкладці «Класи та папки».</p>
        </Card>
      ) : (
        <>
          <Card title="Оберіть клас" menu={false}>
            <div className="flex flex-wrap gap-2">
              {classes.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedClassId(c.id)}
                  className={`rounded-[10px] border-[1.5px] px-4 py-2.5 text-[13px] font-bold transition-colors ${
                    selectedClassId === c.id
                      ? "border-purple bg-purple-pale text-purple-deep"
                      : "border-line bg-card text-ink hover:border-purple-soft"
                  }`}
                >
                  {c.name}
                  <span className="ml-1.5 font-normal text-ink-soft">{c.schoolName}</span>
                </button>
              ))}
            </div>
          </Card>

          {creds && (
            <>
              <Card title="Скільки камер підключаєш?" menu={false}>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => setCameraCount(n)}
                      className={`flex h-[42px] w-[42px] items-center justify-center rounded-[10px] border-[1.5px] text-[15px] font-extrabold transition-colors ${
                        cameraCount === n
                          ? "border-purple bg-purple text-white"
                          : "border-line bg-card text-ink hover:border-purple-soft"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <p className="mt-2.5 text-xs text-ink-soft">
                  Усі камери одного класу підключаються однаковими логіном і паролем — різняться лише
                  цільовою папкою в налаштуваннях кожної камери.
                </p>
              </Card>

              <div className="grid gap-3.5 sm:grid-cols-2">
                {visibleSlots.map((slot) => (
                  <Card key={slot.key} title={`${slot.emoji} ${slot.label}`} menu={false}>
                    <div className="flex flex-col gap-2.5">
                      <CopyField label="Host (адреса сервера)" value={primaryIp ?? "— спершу увімкни прийом —"} />
                      <CopyField label="Порт" value={String(status?.port ?? 2121)} />
                      <CopyField label="Логін" value={creds.username} />
                      <CopyField label="Пароль" value={creds.password} />
                      <CopyField label="Цільова папка (Directory)" value={slot.key === "uncategorized" ? "/ (не вказувати)" : `/${slot.key}`} />
                    </div>
                  </Card>
                ))}
              </div>

              <Card menu={false}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">📸</span>
                  <div>
                    <div className="text-[20px] font-extrabold text-purple-deep">{receivedCount}</div>
                    <div className="text-xs text-ink-soft">фото прийнято з моменту відкриття цієї сторінки</div>
                  </div>
                </div>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
