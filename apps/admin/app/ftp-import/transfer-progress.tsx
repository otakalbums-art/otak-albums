"use client";

import { Activity, Clock, Upload } from "lucide-react";

export type TransferStats = {
  active: { file: string; kind: "jpeg" | "raw"; bytes: number; expected: number; seconds: number }[];
  speedBps: number;
  lastHour: { jpeg: number; raw: number; bytes: number };
  lastReceivedAt: number | null;
  queue: { jpeg: number; raw: number; uploading: number };
};

function mb(bytes: number) {
  return (bytes / 1_000_000).toFixed(bytes < 10_000_000 ? 1 : 0);
}

function ago(ts: number | null) {
  if (!ts) return "ще нічого";
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s} с тому`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} хв тому` : `${Math.round(m / 60)} год тому`;
}

/**
 * Живий прогрес прийому з камери: що зараз передається (байти, швидкість),
 * черга вивантаження на платформу й підсумок за годину. Дані — з приймача на
 * сервері камер (/status → transfer), оновлюються кожні 3 с разом зі статусом.
 */
export function TransferProgress({ stats }: { stats: TransferStats | null | undefined }) {
  if (!stats) return null;
  const speed = stats.speedBps;
  const waiting = stats.queue.jpeg + stats.queue.raw + stats.queue.uploading;
  const stalled = stats.lastReceivedAt && Date.now() - stats.lastReceivedAt > 5 * 60_000 && !stats.active.length;

  return (
    <div className="mt-3 rounded-[11px] border border-line bg-page p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[13px] font-bold">
          <Activity className="h-4 w-4 text-purple" /> Передача з камери
        </span>
        <span
          className={`rounded-lg px-2.5 py-1 font-mono text-[12.5px] font-bold ${
            speed > 0 ? "bg-[#E7F7EE] text-ok" : "bg-line text-ink-soft"
          }`}
        >
          {speed > 0
            ? `${(speed / 1_000_000).toFixed(2)} МБ/с · ${((speed * 8) / 1_000_000).toFixed(1)} Мбіт/с`
            : "0 МБ/с · 0 Мбіт/с"}
        </span>
      </div>

      {stats.active.length > 0 ? (
        <div className="flex flex-col gap-2">
          {stats.active.map((t) => {
            const pct = Math.min(99, Math.round((t.bytes / Math.max(t.expected, 1)) * 100));
            return (
              <div key={t.file}>
                <div className="mb-1 flex items-center justify-between gap-2 text-[12px]">
                  <span className="font-mono font-semibold">
                    {t.file}{" "}
                    <span className={`rounded px-1 text-[10px] ${t.kind === "jpeg" ? "bg-purple-pale text-purple-deep" : "bg-line text-ink-soft"}`}>
                      {t.kind === "jpeg" ? "JPEG" : "RAW"}
                    </span>
                  </span>
                  <span className="text-ink-soft">
                    {mb(t.bytes)} з ~{mb(t.expected)} МБ · {t.seconds} с
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-purple-pale">
                  <div className="h-full bg-purple transition-all duration-700" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[12px] text-ink-soft">Зараз камера нічого не передає.</p>
      )}

      <div className="mt-2.5 grid gap-1.5 text-[11.5px] text-ink-soft sm:grid-cols-3">
        <span className="flex items-center gap-1">
          <Upload className="h-3.5 w-3.5" />
          {waiting ? (
            <>
              Вивантажується на платформу: <b className="text-ink">{waiting}</b>
              {stats.queue.raw > 0 && ` (RAW у черзі: ${stats.queue.raw})`}
            </>
          ) : (
            "Черга на платформу порожня"
          )}
        </span>
        <span>
          За годину прийнято: <b className="text-ink">{stats.lastHour.jpeg}</b> JPEG, <b className="text-ink">{stats.lastHour.raw}</b> RAW ·{" "}
          {mb(stats.lastHour.bytes)} МБ
        </span>
        <span className={`flex items-center gap-1 ${stalled ? "font-semibold text-warn" : ""}`}>
          <Clock className="h-3.5 w-3.5" /> Останній файл: {ago(stats.lastReceivedAt)}
        </span>
      </div>
      <p className="mt-1.5 text-[10.5px] text-ink-soft">
        Відсоток — оцінка за середнім розміром попередніх файлів (камера не повідомляє розмір наперед). 1 МБ/с = 8
        Мбіт/с — тести швидкості на телефоні показують саме Мбіт/с.
      </p>
    </div>
  );
}
