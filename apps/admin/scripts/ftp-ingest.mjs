#!/usr/bin/env node
/**
 * Локальний приймач фото з Wi-Fi камер (FTP) — MVP-версія: одна спільна
 * "папка" (=FTP-логін) на клас, без поділу за фотоапаратами/категоріями.
 *
 * Запускати окремо від `pnpm dev`, на тому ж комп'ютері, що й адмінка,
 * поки триває зйомка:  pnpm --filter admin run ftp:start
 *
 * Що робить:
 *   1) Піднімає FTP-сервер на локальній мережі — кожен активний клас
 *      отримує окремий логін/пароль (детерміновано виведені з class_id +
 *      FTP_INGEST_SECRET, нічого додатково зберігати в БД не треба).
 *      Камера, підключена з цими креденшлами, бачить лише СВІЙ корінь —
 *      підпапки на боці камери вказувати не треба.
 *   2) Стежить (chokidar) за локальною папкою-приймачем; коли файл
 *      дописаний повністю (awaitWriteFinish) і це валідний JPEG —
 *      вивантажує в Supabase Storage bucket "photos" і вставляє рядок
 *      у таблицю `photos` — так само, як POST /api/photos/upload.
 *   3) Учні бачать нове фото миттєво: галерея вже підписана на
 *      postgres_changes INSERT (apps/client/app/gallery/page.tsx).
 *
 * Дивись docs/camera-ftp-ingest.md — покроково, як налаштувати камеру.
 */

import { createClient } from "@supabase/supabase-js";
import FtpSrv from "ftp-srv";
import chokidar from "chokidar";
import { createHmac, randomUUID } from "crypto";
import { networkInterfaces } from "os";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ADMIN_ROOT = path.resolve(__dirname, "..");

// --- env (окремий процес, поза Next.js -> читаємо .env.local вручну) ---
function loadEnvLocal() {
  const file = path.join(ADMIN_ROOT, ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
loadEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Немає NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY в apps/admin/.env.local");
  process.exit(1);
}

let FTP_SECRET = process.env.FTP_INGEST_SECRET;
if (!FTP_SECRET) {
  FTP_SECRET = "dev-only-insecure-secret-change-me";
  console.warn(
    "⚠ FTP_INGEST_SECRET не задано в .env.local — використовую dev-заглушку. " +
      "Задай власний секрет перед реальною зйомкою (креденшли кожного класу від нього залежать)."
  );
}

const FTP_PORT = Number(process.env.FTP_PORT || 2121);
const PASV_MIN = Number(process.env.FTP_PASV_MIN || 2122);
const PASV_MAX = Number(process.env.FTP_PASV_MAX || 2130);

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// --- креденшли класу (той самий алгоритм, що й на сторінці /ftp-import) ---
export function ftpCredentialsForClass(classId) {
  const h = createHmac("sha256", FTP_SECRET).update(classId).digest("hex");
  return { username: `class-${h.slice(0, 6)}`, password: h.slice(6, 18) };
}

function lanIps() {
  const out = [];
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === "IPv4" && !a.internal) out.push({ name, address: a.address });
    }
  }
  return out;
}

const DROP_ROOT = path.join(ADMIN_ROOT, ".photo-drop");
fs.mkdirSync(DROP_ROOT, { recursive: true });

// --- FTP-сервер ---
const primaryIp = lanIps()[0]?.address ?? "127.0.0.1";
const ftpServer = new FtpSrv({
  url: `ftp://0.0.0.0:${FTP_PORT}`,
  pasv_url: primaryIp,
  pasv_min: PASV_MIN,
  pasv_max: PASV_MAX,
  anonymous: false,
  greeting: ["Otak Albums — camera ingest"],
});

ftpServer.on("login", async ({ username, password }, resolve, reject) => {
  const { data: classes } = await supabase.from("classes").select("id").eq("status", "active");
  const match = (classes ?? []).find((c) => {
    const cred = ftpCredentialsForClass(c.id);
    return cred.username === username && cred.password === password;
  });

  if (!match) return reject(new Error("Невірні креденшли"));

  const root = path.join(DROP_ROOT, match.id);
  fs.mkdirSync(root, { recursive: true });
  resolve({ root });
});

ftpServer.on("client-error", ({ context, error }) => {
  console.error(`[ftp] помилка з'єднання (${context}):`, error.message);
});

// --- watcher: коли файл дописаний -> вивантажити в Storage ---
const ingestedRoot = (classId) => path.join(DROP_ROOT, classId, "_ingested");

async function isJpeg(filePath) {
  const fd = await fs.promises.open(filePath, "r");
  const buf = Buffer.alloc(3);
  await fd.read(buf, 0, 3, 0);
  await fd.close();
  return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

async function ingest(filePath) {
  const rel = path.relative(DROP_ROOT, filePath);
  const segments = rel.split(path.sep);
  const classId = segments[0];
  const filename = path.basename(filePath);

  if (segments.includes("_ingested") || segments.includes("_errors")) return;
  if (!/\.jpe?g$/i.test(filename)) {
    console.log(`[ftp-ingest] пропущено (не .jpg/.jpeg): ${rel}`);
    return;
  }

  try {
    const { data: klass } = await supabase.from("classes").select("id").eq("id", classId).maybeSingle();
    if (!klass) {
      console.warn(`[ftp-ingest] невідомий class_id у шляху, пропускаю: ${rel}`);
      return;
    }
    if (!(await isJpeg(filePath))) {
      console.warn(`[ftp-ingest] файл не є валідним JPEG (за magic bytes), пропускаю: ${rel}`);
      return;
    }

    const bytes = await fs.promises.readFile(filePath);
    const storagePath = `${classId}/uncategorized/${randomUUID()}-${filename}`;

    const { error: uploadError } = await supabase.storage
      .from("photos")
      .upload(storagePath, bytes, { contentType: "image/jpeg", upsert: false });
    if (uploadError) throw uploadError;

    const { error: insertError } = await supabase.from("photos").insert({
      class_id: classId,
      storage_path: storagePath,
      filename,
      file_type: "jpeg",
      category: "uncategorized",
    });
    if (insertError) throw insertError;

    const dest = path.join(ingestedRoot(classId), filename);
    await fs.promises.mkdir(path.dirname(dest), { recursive: true });
    await fs.promises.rename(filePath, dest);

    console.log(`[ftp-ingest] ✓ ${filename} -> клас ${classId}`);
  } catch (err) {
    console.error(`[ftp-ingest] ✗ помилка для ${rel}:`, err.message);
    const dest = path.join(DROP_ROOT, classId, "_errors", filename);
    await fs.promises.mkdir(path.dirname(dest), { recursive: true }).catch(() => {});
    await fs.promises.rename(filePath, dest).catch(() => {});
  }
}

const watcher = chokidar.watch(DROP_ROOT, {
  ignored: (p) => p.includes("_ingested") || p.includes("_errors"),
  ignoreInitial: false,
  awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 200 },
});
watcher.on("add", ingest);

// --- старт + інфо для налаштування камери ---
ftpServer
  .listen()
  .then(() => {
    console.log("═".repeat(60));
    console.log("FTP-приймач фото запущено");
    console.log(`  Порт: ${FTP_PORT} (passive: ${PASV_MIN}-${PASV_MAX})`);
    console.log("  IP-адреси в локальній мережі:");
    for (const ip of lanIps()) console.log(`    ${ip.address}  (${ip.name})`);
    console.log("  Креденшли на клас дивись у адмінці: /ftp-import");
    console.log("═".repeat(60));
  })
  .catch((err) => {
    console.error("Не вдалося запустити FTP-сервер:", err.message);
    process.exit(1);
  });

process.on("SIGINT", async () => {
  await ftpServer.close();
  await watcher.close();
  process.exit(0);
});
