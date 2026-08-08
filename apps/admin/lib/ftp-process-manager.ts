import { spawn, execSync, type ChildProcess } from "child_process";
import path from "path";

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
};

const g = globalThis as unknown as { __ftpManager?: ManagerState };
if (!g.__ftpManager) {
  g.__ftpManager = { child: null, startedAt: null, logs: [] };
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

  child.stdout?.on("data", (d) => pushLog(d.toString()));
  child.stderr?.on("data", (d) => pushLog(d.toString()));
  child.on("exit", (code) => {
    pushLog(`[процес завершився, код ${code}]`);
    state.child = null;
    state.startedAt = null;
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
