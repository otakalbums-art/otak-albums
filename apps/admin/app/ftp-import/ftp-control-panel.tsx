"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, Toggle } from "@otak/ui";
import { AlertTriangle, Camera, Check, Copy, Loader2, Pencil } from "lucide-react";
import { CategoryIcon } from "@/lib/photo-categories";

type ClassOption = { id: string; name: string; schoolName: string };
type Creds = { username: string; password: string };

const CATEGORY_SLOTS: { key: string; label: string }[] = [
  { key: "portrait", label: "Портрети" },
  { key: "group", label: "Групові" },
  { key: "ceremony", label: "Церемонія" },
  { key: "personal", label: "Персональні" },
  { key: "uncategorized", label: "Без категорії" },
];

const LABELS_STORAGE_KEY = "otak-ftp-category-labels";

/** Іконка + назва картки з олівцем — клік перемикає в режим редагування, Enter/blur зберігає. */
function EditableTitle({ category, value, onChange }: { category: string; value: string; onChange: (next: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  function save() {
    const next = draft.trim();
    if (next) onChange(next);
    setEditing(false);
  }

  if (editing) {
    return (
      <span className="flex items-center gap-1.5">
        <CategoryIcon category={category} className="h-4 w-4 text-purple" />
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
              setDraft(value);
              setEditing(false);
            }
          }}
          className="w-[140px] rounded-md border border-purple bg-white px-1.5 py-0.5 text-[13.5px] font-bold outline-none"
        />
      </span>
    );
  }

  return (
    <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 hover:text-purple">
      <CategoryIcon category={category} className="h-4 w-4 text-purple" />
      <span>{value}</span>
      <Pencil className="h-3 w-3 text-ink-soft" />
    </button>
  );
}

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
        <span className="inline-flex flex-shrink-0 items-center gap-1 text-[11px] font-bold text-purple">
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Скопійовано" : "Копіювати"}
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
  const [status, setStatus] = useState<{
    running: boolean;
    ips: { address: string; name: string }[];
    port: number;
    logs: string[];
    unavailable?: boolean;
    unavailableReason?: "not_configured" | "vm_unreachable";
    mode?: "local" | "cloud";
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);

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
    setToggleError(null);
    const res = await fetch(next ? "/api/ftp/start" : "/api/ftp/stop", { method: "POST" });
    const data = await res.json().catch(() => null);
    if (data?.ok === false && data.error) setToggleError(data.error);
    await refreshStatus();
    setBusy(false);
  }

  // --- перейменування карток категорій (зберігається в браузері) ---
  const [labels, setLabels] = useState<Record<string, string>>(
    Object.fromEntries(CATEGORY_SLOTS.map((s) => [s.key, s.label]))
  );

  useEffect(() => {
    const saved = localStorage.getItem(LABELS_STORAGE_KEY);
    if (saved) {
      try {
        setLabels((prev) => ({ ...prev, ...JSON.parse(saved) }));
      } catch {
        // ігноруємо биті дані в localStorage
      }
    }
  }, []);

  function renameCategory(key: string, next: string) {
    setLabels((prev) => {
      const updated = { ...prev, [key]: next };
      localStorage.setItem(LABELS_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
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

  // --- лічильник щойно прийнятих фото (опитування, з моменту відкриття сторінки) ---
  // Не Supabase Realtime: RLS для anon закритий навмисно (docs/auth-strategy.md),
  // а admin-сесія тут не рятує ситуацію універсально — простіше й надійніше
  // опитувати той самий /api/classes/[id]/photo-count скрізь, тим паче що
  // затримка в 3с непомітна в контексті фотозйомки.
  const [receivedCount, setReceivedCount] = useState(0);
  const baselineRef = useRef<number | null>(null);

  useEffect(() => {
    baselineRef.current = null;
    setReceivedCount(0);
    if (!selectedClassId) return;

    let cancelled = false;
    async function poll() {
      const res = await fetch(`/api/classes/${selectedClassId}/photo-count`);
      if (!res.ok || cancelled) return;
      const { count } = await res.json();
      if (baselineRef.current === null) baselineRef.current = count;
      setReceivedCount(Math.max(0, count - (baselineRef.current ?? count)));
    }

    poll();
    const id = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
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
            {busy && (
              <span className="inline-flex items-center gap-1 text-xs text-ink-soft">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Секунду…
              </span>
            )}
          </div>
          <Toggle
            checked={!!status?.running}
            onChange={(next) => toggleServer(next)}
            disabled={!!status?.unavailable}
            aria-label="Увімкнути/вимкнути прийом фото"
          />
        </div>

        {status?.unavailable && status.unavailableReason === "not_configured" && (
          <p className="mt-3 flex gap-1.5 rounded-[9px] bg-[#FFF4E5] p-2.5 text-xs text-ink">
            <AlertTriangle className="mt-px h-3.5 w-3.5 flex-shrink-0 text-[#C77700]" />
            <span>
              Сервер прийому ще не підключено до цієї адмінки (не задано FTP_VM_HOST /
              FTP_CONTROL_SECRET у Vercel).
            </span>
          </p>
        )}

        {status?.unavailable && status.unavailableReason === "vm_unreachable" && (
          <p className="mt-3 flex gap-1.5 rounded-[9px] bg-[#FFE5E5] p-2.5 text-xs text-ink">
            <AlertTriangle className="mt-px h-3.5 w-3.5 flex-shrink-0 text-warn" />
            <span>
              Не вдалось зв'язатись із сервером прийому — можливо, він зараз перезапускається
              або лежить. Спробуй за хвилину; якщо не допомогло — звернись до розробника.
            </span>
          </p>
        )}

        {toggleError && !status?.unavailable && (
          <p className="mt-3 flex gap-1.5 rounded-[9px] bg-[#FFE5E5] p-2.5 text-xs text-ink">
            <AlertTriangle className="mt-px h-3.5 w-3.5 flex-shrink-0 text-warn" />
            <span>{toggleError}</span>
          </p>
        )}

        {!status?.unavailable && status?.mode === "local" && status?.running && primaryIp && (
          <p className="mt-3 text-xs text-ink-soft">
            Комп'ютер і камера мають бути в одній Wi-Fi мережі. Адреса комп'ютера:{" "}
            <b className="font-mono text-ink">{primaryIp}</b>, порт <b className="font-mono text-ink">{status.port}</b>.
          </p>
        )}

        {!status?.unavailable && status?.mode === "cloud" && status?.running && primaryIp && (
          <p className="mt-3 text-xs text-ink-soft">
            Камера підключається через інтернет (Wi-Fi з доступом в мережу — venue, хотспот,
            будь-що) до фіксованої адреси сервера:{" "}
            <b className="font-mono text-ink">{primaryIp}</b>, порт <b className="font-mono text-ink">{status.port}</b>.
            Ноутбук фотографа тут ні до чого — налаштування на камері одноразові.
          </p>
        )}

        {!status?.unavailable && !status?.running && (
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

      {status?.unavailable ? null : classes.length === 0 ? (
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
                  <Card
                    key={slot.key}
                    title={
                      <EditableTitle
                        category={slot.key}
                        value={labels[slot.key] ?? slot.label}
                        onChange={(next) => renameCategory(slot.key, next)}
                      />
                    }
                    menu={false}
                  >
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
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-pale text-purple">
                    <Camera className="h-5 w-5" />
                  </span>
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
