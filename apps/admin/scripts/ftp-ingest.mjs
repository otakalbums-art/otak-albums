#!/usr/bin/env node
/**
 * Локальний приймач фото з Wi-Fi камер (FTP).
 *
 * Запускати окремо від `pnpm dev`, на тому ж комп'ютері, що й адмінка,
 * поки триває зйомка:  pnpm --filter admin run ftp:start
 *
 * Що робить:
 *   1) Піднімає FTP-сервер на локальній мережі — кожен активний клас
 *      отримує окремий логін/пароль (детерміновано виведені з class_id +
 *      FTP_INGEST_SECRET, нічого додатково зберігати в БД не треба).
 *   2) Мультикамерний поділ по папках — БЕЗ окремих логінів на кожну
 *      камеру: усі камери класу підключаються тим самим логіном, а
 *      відмінність лише в "цільовій папці" (Directory) у налаштуваннях
 *      FTP кожної камери. Назва підпапки = категорія фото (той самий
 *      enum, що й у ручному завантаженні через адмінку):
 *      portrait / group / ceremony / personal / uncategorized.
 *      Ці підпапки створюються автоматично при вході; камера, що не
 *      вказала директорію, пише прямо в корінь -> category="uncategorized".
 *      "personal" тут без прив'язки до конкретного учня (student_id=null) —
 *      набирати UUID учня в меню камери нереалістично; прив'язати вручну
 *      можна пізніше через адмінку.
 *   3) Стежить (chokidar) за локальною папкою-приймачем; коли файл
 *      дописаний повністю (awaitWriteFinish) і це валідний JPEG або
 *      відомий RAW-формат (CR2/NEF/ARW/... — див. RAW_EXTENSIONS нижче) —
 *      вивантажує в Supabase Storage bucket "photos" (у підпапку JPEG/ або
 *      RAW/ усередині категорії — система сама обирає за розширенням) і
 *      вставляє рядок у таблицю `photos` — так само, як POST /api/photos/upload.
 *   4) Учні бачать нове JPEG-фото миттєво: галерея вже підписана на
 *      postgres_changes INSERT (apps/client/app/gallery/page.tsx), і її API
 *      відфільтровує RAW (apps/client/app/api/photos/route.ts, file_type =
 *      'jpeg') — RAW доступний лише в адмінці.
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

// Мають збігатися з check-constraint `photos.category` у supabase/migrations/0001_init.sql.
export const CATEGORIES = ["portrait", "group", "ceremony", "personal", "uncategorized"];

// Той самий список, що й у apps/admin/lib/file-type.ts (тут продубльовано —
// цей файл окремий Node-процес, не проходить через збірку Next.js, тому
// імпортувати звідти напряму не може, той самий привід, що й
// ftpCredentialsForClass вище). Тримай синхронними з обома місцями, і з
// check-constraint `photos_file_type_check` у
// supabase/migrations/0003_raw_support.sql.
const RAW_EXTENSIONS = {
  cr2: "cr2",
  cr3: "cr3", // Canon
  nef: "nef",
  nrw: "nrw", // Nikon
  arw: "arw",
  sr2: "sr2", // Sony
  raf: "raf", // Fujifilm
  orf: "orf", // Olympus/OM System
  rw2: "rw2", // Panasonic
  pef: "pef", // Pentax
  srw: "srw", // Samsung
  x3f: "x3f", // Sigma
  dng: "dng", // Adobe DNG / узагальнений RAW
};

/** file_type (точне розширення) за іменем файлу, або null якщо не підтримується. */
function detectFileType(filename) {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (!ext) return null;
  if (ext === "jpg" || ext === "jpeg") return "jpeg";
  return RAW_EXTENSIONS[ext] ?? null;
}

/** Назва підпапки в Storage ("JPEG" або "RAW") для даного file_type. */
function folderFor(fileType) {
  return fileType === "jpeg" ? "JPEG" : "RAW";
}

// --- креденшли класу (той самий алгоритм, що й на сторінці /ftp-import) ---
export function ftpCredentialsForClass(classId) {
  const h = createHmac("sha256", FTP_SECRET).update(classId).digest();
  const username = String(100000 + (h.readUInt32BE(0) % 900000));
  const password = String(100000 + (h.readUInt32BE(4) % 900000));
  return { username, password };
}

function lanIps() {
  const out = [];
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    for (const a of addrs ?? []) {
      // 169.254.x.x (APIPA/link-local) — див. коментар біля дубліката в
      // apps/admin/lib/ftp-credentials.ts.
      if (a.family === "IPv4" && !a.internal && !a.address.startsWith("169.254.")) {
        out.push({ name, address: a.address });
      }
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
  // Наперед створюємо підпапки-категорії, щоб камера могла в них CWD/STOR,
  // навіть якщо сама MKD не вміє/не робить.
  for (const category of CATEGORIES) {
    fs.mkdirSync(path.join(root, category), { recursive: true });
  }
  resolve({ root });
});

ftpServer.on("client-error", ({ context, error }) => {
  console.error(`[ftp] помилка з'єднання (${context}):`, error.message);
});

// --- watcher: коли файл дописаний -> вивантажити в Storage ---
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

  const fileType = detectFileType(filename);
  if (!fileType) {
    console.log(`[ftp-ingest] пропущено (не JPEG і не відомий RAW-формат): ${rel}`);
    return;
  }

  // segments = [classId, ...можлива категорія-підпапка..., filename]
  // Камера без вказаної Directory пише прямо в корінь -> segments.length === 2.
  const maybeCategory = segments.length >= 3 ? segments[1] : null;
  const category = CATEGORIES.includes(maybeCategory) ? maybeCategory : "uncategorized";

  try {
    const { data: klass } = await supabase.from("classes").select("id").eq("id", classId).maybeSingle();
    if (!klass) {
      console.warn(`[ftp-ingest] невідомий class_id у шляху, пропускаю: ${rel}`);
      return;
    }
    // Magic-bytes перевірка робиться лише для JPEG (формат простий і
    // однаковий у всіх виробників); RAW-формати надто різні між собою
    // (TIFF-контейнер у більшості, але CR3 — ISO-BMFF, RAF — власний
    // заголовок) — довіряємо розширенню файлу, як і форма ручного
    // завантаження в адмінці (app/api/photos/upload/route.ts).
    if (fileType === "jpeg" && !(await isJpeg(filePath))) {
      console.warn(`[ftp-ingest] файл не є валідним JPEG (за magic bytes), пропускаю: ${rel}`);
      return;
    }

    const bytes = await fs.promises.readFile(filePath);
    const folder = folderFor(fileType);
    const storagePath = `${classId}/${category}/${folder}/${randomUUID()}-${filename}`;
    const contentType = fileType === "jpeg" ? "image/jpeg" : "application/octet-stream";

    const { error: uploadError } = await supabase.storage
      .from("photos")
      .upload(storagePath, bytes, { contentType, upsert: false });
    if (uploadError) throw uploadError;

    const { error: insertError } = await supabase.from("photos").insert({
      class_id: classId,
      storage_path: storagePath,
      filename,
      file_type: fileType,
      category,
    });
    if (insertError) throw insertError;

    // _ingested лежить всередині тієї ж категорійної підпапки, щоб два
    // різні кадри з однаковою назвою з різних категорій не перезаписали одне одного.
    const dest = path.join(DROP_ROOT, classId, category, "_ingested", filename);
    await fs.promises.mkdir(path.dirname(dest), { recursive: true });
    await fs.promises.rename(filePath, dest);

    console.log(`[ftp-ingest] ✓ ${filename} -> клас ${classId}, категорія "${category}", ${folder} (${fileType})`);
  } catch (err) {
    console.error(`[ftp-ingest] ✗ помилка для ${rel}:`, err.message);
    const dest = path.join(DROP_ROOT, classId, category, "_errors", filename);
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
