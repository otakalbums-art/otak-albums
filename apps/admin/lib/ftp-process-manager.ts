import { spawn, execSync, type ChildProcess } from "child_process";
import path from "path";
import { createSupabaseServiceRoleClient } from "@otak/supabase/server";
import { notifyAdmins } from "@otak/push";

/**
 * Керує процесом scripts/ftp-ingest.mjs з кнопок в адмінці замість
 * ручного запуску в терміналі. Стан тримаємо на `globalThis`, бо Next.js
 * dev-сервер перезавантажує модулі при кожній зміні файлу (HMR) — без
 * цього посилання на дочірній процес губилось би між запитами.
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

export function ftpStatus() {
  return {
    running: isAlive(),
    startedAt: state.startedAt,
    logs: state.logs.slice(-50),
  };
}

export function startFtp() {
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

export function stopFtp() {
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
