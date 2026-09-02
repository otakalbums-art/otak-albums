import { spawn, execSync, type ChildProcess } from "child_process";
import path from "path";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { notifyAdmins } from "@otak/push";

/**
 * Керує прийомом фото з камер із кнопок в адмінці. Два режими:
 *
 *  - Локально (`next dev`/`next start` на ноутбуці фотографа) — спавнимо
 *    scripts/ftp-ingest.mjs як дочірній процес, як і раніше. Працює лише
 *    тому, що камера й ноутбук в одній LAN.
 *
 *  - На Vercel (serverless, isCloudEnv() === true) — спавнити тут нічого
 *    не можна (ні довгоживучого TCP-listener, ні навіть самого файлу
 *    скрипта в білді). Замість цього той самий scripts/ftp-ingest.mjs
 *    працює ПОСТІЙНО на окремому VPS із публічною IP (див.
 *    docs/camera-ftp-ingest.md) — камера підключається туди напряму через
 *    інтернет. Тут ми лише проксіюємо увімк/вимк/статус на control-сервер
 *    цього VPS по HTTP (див. control-сервер у самому ftp-ingest.mjs),
 *    захищений спільним FTP_CONTROL_SECRET.
 */

type ManagerState = {
  child: ChildProcess | null;
  startedAt: number | null;
  logs: string[];
  manualStop: boolean;
};

const g = globalThis as unknown as { __ftpManager?: ManagerState };
if (!g.__ftpManager) {
  g.__ftpManager = { child: null, startedAt: null, logs: [], manualStop: false };
}
const state = g.__ftpManager;

function isCloudEnv() {
  return !!process.env.VERCEL;
}

const MAX_LOG_LINES = 200;
function pushLog(chunk: string) {
  for (const line of chunk.split("\n")) {
    if (!line.trim()) continue;
    state.logs.push(line);
  }
  if (state.logs.length > MAX_LOG_LINES) state.logs = state.logs.slice(-MAX_LOG_LINES);
}

function isAlive() {
  return !!state.child && state.child.exitCode === null && state.child.signalCode === null;
}

// --- проксі на VM-приймач (хмарний режим) ---
type VmStatus = { running: boolean; startedAt: number; logs: string[]; host: string; port: number };

function vmConfig() {
  // .trim() — Vercel's env var UI happily stores a copy-pasted trailing
  // newline/space, яке нічим не видно в полі, але ламає URL/секрет.
  const host = process.env.FTP_VM_HOST?.trim();
  const secret = process.env.FTP_CONTROL_SECRET?.trim();
  const port = Number(process.env.FTP_VM_CONTROL_PORT || 8090);
  if (!host || !secret) return null;
  return { host, secret, port };
}

async function vmRequest(pathname: string, method: "GET" | "POST"): Promise<VmStatus | null> {
  const cfg = vmConfig();
  if (!cfg) return null;
  try {
    const res = await fetch(`http://${cfg.host}:${cfg.port}${pathname}`, {
      method,
      headers: { authorization: `Bearer ${cfg.secret}` },
      // Свій сервер у тій самій мережі Vercel<->інтернет — не мільйони мс, але
      // й не миттєво; не даємо запиту зависнути назавжди, якщо VM недоступна.
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      // Логуємо статус (401 — не той секрет/зайвий пробіл при вставці в
      // Vercel; інше — щось на рівні самого control-сервера) — раніше це
      // мовчки повертало null, і від "невірний секрет" було не відрізнити
      // "сервер недосяжний" у відповіді користувачу.
      console.error(`[ftp] control-сервер ${cfg.host}:${cfg.port}${pathname} -> HTTP ${res.status}`);
      return null;
    }
    return (await res.json()) as VmStatus;
  } catch (err) {
    console.error(`[ftp] не вдалось достукатись до control-сервера ${cfg.host}:${cfg.port}${pathname}:`, err);
    return null;
  }
}

export async function ftpStatus() {
  if (isCloudEnv()) {
    const cfg = vmConfig();
    if (!cfg) {
      return {
        running: false,
        startedAt: null,
        logs: [] as string[],
        unavailable: true as const,
        unavailableReason: "not_configured" as const,
        ips: [] as { name: string; address: string }[],
        port: 2121,
        mode: "cloud" as const,
      };
    }
    const s = await vmRequest("/status", "GET");
    return {
      running: s?.running ?? false,
      startedAt: s?.startedAt ?? null,
      logs: s?.logs ?? [],
      unavailable: s === null,
      unavailableReason: s === null ? ("vm_unreachable" as const) : undefined,
      ips: s ? [{ name: "server", address: s.host }] : [],
      port: s?.port ?? Number(process.env.FTP_PORT || 2121),
      mode: "cloud" as const,
    };
  }

  return {
    running: isAlive(),
    startedAt: state.startedAt,
    logs: state.logs.slice(-50),
    unavailable: false as const,
    mode: "local" as const,
  };
}

export async function startFtp() {
  if (isCloudEnv()) {
    const cfg = vmConfig();
    if (!cfg) {
      return {
        ok: false,
        error:
          "Сервер прийому ще не підключено до цієї адмінки — не задано FTP_VM_HOST/FTP_CONTROL_SECRET " +
          "у змінних оточення Vercel.",
      };
    }
    const s = await vmRequest("/enable", "POST");
    if (!s) return { ok: false, error: "Не вдалося зв'язатись із сервером прийому — перевір, чи він працює." };
    return { ok: true, alreadyRunning: false };
  }

  if (isAlive()) return { ok: true, alreadyRunning: true };

  const adminRoot = process.cwd(); // apps/admin під час `next dev`/`next start`
  const child = spawn("node", ["scripts/ftp-ingest.mjs"], {
    cwd: path.resolve(adminRoot),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  state.child = child;
  state.startedAt = Date.now();
  state.logs = [];
  state.manualStop = false;

  child.stdout?.on("data", (d) => pushLog(d.toString()));
  child.stderr?.on("data", (d) => pushLog(d.toString()));
  child.on("exit", (code) => {
    pushLog(`[процес завершився, код ${code}]`);
    // Впав сам, не через кнопку "Зупинити" в адмінці — саме цей випадок
    // і потребує push: посеред зйомки прийом фото з камери міг тихо
    // зупинитись, і ніхто про це не дізнається, поки не зайде в вкладку.
    if (!state.manualStop) {
      const supabase = createSupabaseServiceRoleClient();
      notifyAdmins(supabase, {
        tab: "ftp",
        title: "Прийом з камер зупинився",
        body: `Процес FTP-прийому неочікувано завершився (код ${code}) — фото з камер більше не приймаються`,
        url: "/ftp-import",
      }).catch((err) => console.error("[push] ftp crash notify:", err));
    }
    state.child = null;
    state.startedAt = null;
    state.manualStop = false;
  });
  child.on("error", (err) => {
    pushLog(`[помилка запуску: ${err.message}]`);
    state.child = null;
    state.startedAt = null;
  });

  return { ok: true, alreadyRunning: false };
}

export async function stopFtp() {
  if (isCloudEnv()) {
    const cfg = vmConfig();
    if (!cfg) return { ok: true, wasRunning: false };
    const s = await vmRequest("/disable", "POST");
    return { ok: !!s, wasRunning: true };
  }

  if (!isAlive() || !state.child?.pid) {
    state.child = null;
    state.startedAt = null;
    return { ok: true, wasRunning: false };
  }

  state.manualStop = true; // перевіряється в exit-хендлері вище, до нуляння
  const pid = state.child.pid;
  try {
    // Звичайний child.kill() на Windows часто лишає дочірні хендли (той самий
    // EADDRINUSE, з яким ми стикались раніше) — /T /F гарантовано вбиває все дерево.
    if (process.platform === "win32") {
      execSync(`taskkill /pid ${pid} /T /F`, { stdio: "ignore" });
    } else {
      state.child.kill("SIGTERM");
    }
  } catch {
    // Процес міг уже завершитись між перевіркою і killом — не критично.
  }

  state.child = null;
  state.startedAt = null;
  return { ok: true, wasRunning: true };
}
