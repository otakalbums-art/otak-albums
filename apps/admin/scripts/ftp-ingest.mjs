#!/usr/bin/env node
/**
 * Приймач фото з Wi-Fi камер (FTP).
 *
 * Два способи запуску:
 *   1) Локально на ноутбуці фотографа, поки триває зйомка:
 *      pnpm --filter admin run ftp:start
 *   2) Постійно на окремому сервері з публічною IP (наш продакшн-варіант,
 *      бо Vercel — serverless і не може тримати TCP-listener) — тоді
 *      камера підключається через інтернет до цієї фіксованої адреси,
 *      а не до ноутбука. Систему керування (увімк/вимк із адмінки) описано
 *      нижче в блоці "control-сервер".
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
 *   3) Коли камера завершила передачу файлу (подія STOR), і це цілий JPEG
 *      (є маркер кінця FF D9 — обрізаний кадр не публікуємо) або
 *      відомий RAW-формат (CR2/NEF/ARW/... — див. RAW_EXTENSIONS нижче) —
 *      вивантажує в Supabase Storage bucket "photos" (у підпапку JPEG/ або
 *      RAW/ усередині категорії — система сама обирає за розширенням) і
 *      вставляє рядок у таблицю `photos` — так само, як POST /api/photos/upload.
 *      JPEG іде одразу (до 3 паралельно), RAW — окремою чергою по одному й
 *      лише коли JPEG на відправку немає. Повторно надісланий кадр (та сама
 *      назва в тій самій категорії) замінює файл у наявному записі.
 *   4) Учні бачать нове JPEG-фото миттєво: галерея вже підписана на
 *      postgres_changes INSERT (apps/client/app/gallery/page.tsx), і її API
 *      відфільтровує RAW (apps/client/app/api/photos/route.ts, file_type =
 *      'jpeg') — RAW доступний лише в адмінці.
 *
 * Дивись docs/camera-ftp-ingest.md — покроково, як налаштувати камеру.
 */

import { createClient } from "@supabase/supabase-js";
import FtpSrv, { FileSystem } from "ftp-srv";
import { uploadVariants, variantPaths } from "./photo-variants.mjs";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { networkInterfaces } from "os";
import { fileURLToPath } from "url";
import http from "http";
import path from "path";
import fs from "fs";

/**
 * ftp-srv не вміє wildcard-патерни в LIST/NLST: перед завантаженням файлу
 * камера типово шле `NLST R6__1234*`, щоб перевірити, чи такий файл уже є
 * на сервері. Дефолтна файлова система бібліотеки намагається fs.stat()
 * буквальний рядок "R6__1234*" і падає з ENOENT замість порожнього списку
 * — а камера, отримавши помилку замість "нема такого", просто МОВЧКИ
 * скасовує все завантаження (без жодної помилки на екрані). Відомий баг:
 * https://github.com/QuorumDMS/ftp-srv/discussions/173. Патчимо тим самим
 * способом, що й там: якщо в імені є wildcard — не стати́мо його як файл,
 * а йдемо в list() і фільтруємо вміст директорії регуляркою.
 */
const GLOB_CHARS = /[*?[\]]/;
function globToRegExp(glob) {
  const escaped = glob.replace(/[.+^${}()|\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}
class GlobAwareFileSystem extends FileSystem {
  write(fileName, options) {
    // Режим «лише JPEG»: RAW відхиляємо ще до передачі даних (ftp-srv відповість 550).
    if (jpegOnly && !/\.jpe?g$/i.test(fileName)) {
      rawRejected++;
      if (rawRejected <= 5 || rawRejected % 50 === 0) log(`[ftp] режим «лише JPEG»: відхилено ${fileName} (усього ${rawRejected})`);
      return Promise.reject(new Error("RAW disabled: JPEG only"));
    }
    return super.write(fileName, options);
  }
  get(fileName) {
    if (GLOB_CHARS.test(fileName)) {
      // "Директорія" тут фіктивна — важливо лише isDirectory() === true, щоб
      // LIST/NLST-обробник (ftp-srv/src/commands/registration/list.js) пішов
      // гілкою list() нижче, а не спробував статити сам патерн як файл.
      return Promise.resolve({ name: fileName, isDirectory: () => true, isFile: () => false });
    }
    return super.get(fileName);
  }
  list(dirPath = ".") {
    if (!GLOB_CHARS.test(dirPath)) return super.list(dirPath);
    const normalized = dirPath.replace(/\\/g, "/");
    const slashIdx = normalized.lastIndexOf("/");
    const dir = slashIdx === -1 ? "." : normalized.slice(0, slashIdx) || "/";
    const pattern = slashIdx === -1 ? normalized : normalized.slice(slashIdx + 1);
    const regex = globToRegExp(pattern);
    // super.list() — саме батьківський метод, без wildcard у dir, тож не
    // зациклюємось і отримуємо звичайний, безпечний листинг директорії.
    return super.list(dir).then((entries) => entries.filter((e) => regex.test(e.name)));
  }
}

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

// Категорії (= папки для камер) керуються з адмінки — таблиця photo_categories
// (supabase/migrations/0018_photo_categories.sql). Кеш на хвилину; якщо таблиця
// недоступна — вбудований список.
export const DEFAULT_CATEGORIES = ["portrait", "group", "ceremony", "personal", "uncategorized"];
let categoryCache = { keys: DEFAULT_CATEGORIES, at: 0 };
async function categoryKeys() {
  if (Date.now() - categoryCache.at < 60_000) return categoryCache.keys;
  const { data, error } = await supabase.from("photo_categories").select("key");
  if (!error && data?.length) categoryCache = { keys: data.map((c) => c.key), at: Date.now() };
  else categoryCache = { ...categoryCache, at: Date.now() };
  return categoryCache.keys;
}

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

// --- увімк/вимк прийому, керовано з адмінки (control-сервер нижче) ---
// Персистимо у файл, щоб перезапуск процесу (systemd після падіння/ребута
// сервера) не скидав стан, який фотограф лишив в адмінці.
//
// CONTROL_SECRET читаємо вже тут (а не лише біля control-сервера нижче),
// бо від нього залежить дефолтне значення enabled: якщо секрету нема,
// значить це старий локальний сценарій (spawn/kill процесу з
// ftp-process-manager.ts) — там немає окремого "увімкнути" кроку, сам
// факт запущеного процесу й означає "прийом увімкнено", як було раніше.
// А на постійному сервері (секрет заданий) прийом має лишатись вимкненим,
// доки хтось явно не натисне перемикач в адмінці.
const CONTROL_SECRET = process.env.FTP_CONTROL_SECRET;
const STATE_FILE = path.join(ADMIN_ROOT, "state.json");
let enabled = !CONTROL_SECRET;
// Експериментальний режим «лише JPEG»: RAW від камери відхиляються одразу
// (до передачі даних), щоб камера не витрачала час на ~25 МБ RAW. Вмикається
// й вимикається на льоту через control-сервер (/jpeg-only/on|off), без
// перезапуску — щоб можна було миттєво відкотити, якщо камера «застрягне».
let jpegOnly = false;
try {
  const saved = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  enabled = !!saved.enabled;
  jpegOnly = !!saved.jpegOnly;
} catch {
  // Першого разу файлу ще нема — лишаємось на дефолті за режимом вище.
}
function saveState() {
  fs.writeFileSync(STATE_FILE, JSON.stringify({ enabled, jpegOnly }));
}
function setEnabled(next) {
  enabled = next;
  saveState();
}
function setJpegOnly(next) {
  jpegOnly = next;
  saveState();
}
let rawRejected = 0;

const START_TIME = Date.now();
const MAX_LOG_LINES = 100;
const recentLogs = [];
/** console.log + запам'ятати для /status (щоб адмінка показувала "Технічний лог"). */
function log(line) {
  console.log(line);
  recentLogs.push(line);
  if (recentLogs.length > MAX_LOG_LINES) recentLogs.shift();
}

// --- FTP-сервер ---
// FTP_PUBLIC_HOST — фіксована публічна адреса (задається на сервері явно),
// пріоритетніша за автовизначення: на хмарному VPS у lanIps() поряд із
// публічною IP часто є ще й приватна VPC-адреса (10.x.x.x), і яка з них
// опиниться першою в списку — залежить від ОС, покладатись на це не можна,
// а PASV з приватною адресою камера просто не побачить.
const primaryIp = process.env.FTP_PUBLIC_HOST || lanIps()[0]?.address || "127.0.0.1";
const ftpServer = new FtpSrv({
  url: `ftp://0.0.0.0:${FTP_PORT}`,
  pasv_url: primaryIp,
  pasv_min: PASV_MIN,
  pasv_max: PASV_MAX,
  anonymous: false,
  greeting: ["Otak Albums — camera ingest"],
});

ftpServer.on("login", async ({ username, password, connection }, resolve, reject) => {
  if (!enabled) return reject(new Error("Прийом вимкнено в адмінці"));

  // Усі неархівні класи/групи (раніше лише "active", а нові класи лишались "pending" і не могли підключитись).
  const { data: classes } = await supabase.from("classes").select("id").neq("status", "archived");
  const match = (classes ?? []).find((c) => {
    const cred = ftpCredentialsForClass(c.id);
    return cred.username === username && cred.password === password;
  });

  if (!match) return reject(new Error("Невірні креденшли"));

  const root = path.join(DROP_ROOT, match.id);
  fs.mkdirSync(root, { recursive: true });
  // Наперед створюємо підпапки-категорії, щоб камера могла в них CWD/STOR,
  // навіть якщо сама MKD не вміє/не робить.
  for (const category of await categoryKeys()) {
    fs.mkdirSync(path.join(root, category), { recursive: true });
  }
  log(`[ftp] ✓ підключення від камери, клас ${match.id}`);
  // Файл обробляємо лише тоді, коли камера сама завершила передачу (STOR),
  // а не після паузи в записі: на повільному Wi-Fi пауза ≠ кінець файлу.
  connection.on("STOR", (error, serverPath) => {
    if (error) {
      log(`[ftp] ✗ передачу перервано (${error.message}) — чекаю повторної спроби камери`);
      return;
    }
    if (serverPath) enqueue(serverPath);
  });
  resolve({ fs: new GlobAwareFileSystem(connection, { root }) });
});

ftpServer.on("client-error", ({ context, error }) => {
  log(`[ftp] ✗ помилка з'єднання (${context}): ${error.message}`);
});

// --- обробка файлу після STOR -> вивантажити в Storage ---
async function isJpeg(filePath) {
  const fd = await fs.promises.open(filePath, "r");
  const buf = Buffer.alloc(3);
  await fd.read(buf, 0, 3, 0);
  await fd.close();
  return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

/**
 * Цілий JPEG закінчується маркером EOI (FF D9). Шукаємо його в останніх
 * 64 КБ (деякі камери дописують після нього службові нулі). Нема маркера —
 * файл обірвався посеред передачі.
 */
async function jpegComplete(filePath) {
  const { size } = await fs.promises.stat(filePath);
  if (size < 4) return false;
  const len = Math.min(size, 64 * 1024);
  const fd = await fs.promises.open(filePath, "r");
  const buf = Buffer.alloc(len);
  await fd.read(buf, 0, len, size - len);
  await fd.close();
  for (let i = len - 2; i >= 0; i--) {
    if (buf[i] === 0xff && buf[i + 1] === 0xd9) return true;
  }
  return false;
}

// --- черги: JPEG одразу (до 3 паралельно), RAW по одному й лише коли JPEG немає ---
// Батьки бачать лише JPEG, тож він ніколи не чекає за важким RAW.
const JPEG_CONCURRENCY = 3;
const jpegQueue = [];
const rawQueue = [];
let jpegActive = 0;
let rawActive = false;

function enqueue(filePath) {
  const fileType = detectFileType(path.basename(filePath));
  if (!fileType) {
    log(`[ftp-ingest] пропущено (не JPEG і не відомий RAW-формат): ${path.relative(DROP_ROOT, filePath)}`);
    return;
  }
  const queue = fileType === "jpeg" ? jpegQueue : rawQueue;
  if (!queue.includes(filePath)) queue.push(filePath);
  pump();
}

function pump() {
  while (jpegActive < JPEG_CONCURRENCY && jpegQueue.length) {
    const next = jpegQueue.shift();
    jpegActive++;
    ingest(next).finally(() => {
      jpegActive--;
      pump();
    });
  }
  if (!rawActive && jpegActive === 0 && jpegQueue.length === 0 && rawQueue.length) {
    const next = rawQueue.shift();
    rawActive = true;
    ingest(next).finally(() => {
      rawActive = false;
      pump();
    });
  }
}

async function ingest(filePath) {
  const rel = path.relative(DROP_ROOT, filePath);
  const segments = rel.split(path.sep);
  const classId = segments[0];
  const filename = path.basename(filePath);

  if (segments.includes("_ingested") || segments.includes("_errors") || segments.includes("_incomplete")) return;
  // Файл могли вже обробити/перемістити (повторна STOR того ж шляху в черзі).
  if (!fs.existsSync(filePath)) return;

  const fileType = detectFileType(filename);
  if (!fileType) {
    log(`[ftp-ingest] пропущено (не JPEG і не відомий RAW-формат): ${rel}`);
    return;
  }

  // segments = [classId, ...можлива категорія-підпапка..., filename]
  // Камера без вказаної Directory пише прямо в корінь -> segments.length === 2.
  const maybeCategory = segments.length >= 3 ? segments[1] : null;
  let category = (await categoryKeys()).includes(maybeCategory) ? maybeCategory : "uncategorized";

  try {
    const { data: klass } = await supabase.from("classes").select("id").eq("id", classId).maybeSingle();
    if (!klass) {
      log(`[ftp-ingest] невідомий class_id у шляху, пропускаю: ${rel}`);
      return;
    }
    // Magic-bytes перевірка робиться лише для JPEG (формат простий і
    // однаковий у всіх виробників); RAW-формати надто різні між собою
    // (TIFF-контейнер у більшості, але CR3 — ISO-BMFF, RAF — власний
    // заголовок) — довіряємо розширенню файлу, як і форма ручного
    // завантаження в адмінці (app/api/photos/upload/route.ts).
    if (fileType === "jpeg" && !(await isJpeg(filePath))) {
      log(`[ftp-ingest] файл не є валідним JPEG (за magic bytes), пропускаю: ${rel}`);
      return;
    }
    if (fileType === "jpeg" && !(await jpegComplete(filePath))) {
      // Не публікуємо обрізаний кадр — камера зазвичай шле його повторно.
      const dest = path.join(DROP_ROOT, classId, category, "_incomplete", `${Date.now()}-${filename}`);
      await fs.promises.mkdir(path.dirname(dest), { recursive: true });
      await fs.promises.rename(filePath, dest);
      log(`[ftp-ingest] ⚠ ${filename} недокачаний (немає кінця JPEG) — не публікую, чекаю повторної передачі`);
      return;
    }

    // RAW (напр. скинутий пізніше з картки через FTP) — у категорію свого JPEG
    // з тією ж назвою, щоб в адмінці вони стали однією плиткою.
    if (fileType !== "jpeg") {
      const base = filename.replace(/\.[^.]+$/, "");
      const { data: twins } = await supabase
        .from("photos")
        .select("filename, category")
        .eq("class_id", classId)
        .eq("file_type", "jpeg")
        .ilike("filename", `${base}.%`)
        .limit(5);
      const twin = (twins ?? []).find((t) => t.filename.replace(/\.[^.]+$/, "").toLowerCase() === base.toLowerCase());
      if (twin && twin.category !== category) category = twin.category;
    }

    const bytes = await fs.promises.readFile(filePath);
    const folder = folderFor(fileType);
    const storagePath = `${classId}/${category}/${folder}/${randomUUID()}-${filename}`;
    const contentType = fileType === "jpeg" ? "image/jpeg" : "application/octet-stream";

    const { error: uploadError } = await supabase.storage
      .from("photos")
      .upload(storagePath, bytes, { contentType, upsert: false });
    if (uploadError) throw uploadError;

    // Мініатюра й preview — до появи запису в БД, щоб галерея одразу тягнула легку версію.
    if (fileType === "jpeg") await uploadVariants(supabase, storagePath, bytes, log);

    // Той самий кадр уже є (камера перенадіслала після обриву) — замінюємо файл
    // у наявному записі: вибір учнів, обране й CRM-слоти, прив'язані до id, лишаються.
    const { data: existing } = await supabase
      .from("photos")
      .select("id, storage_path")
      .eq("class_id", classId)
      .eq("category", category)
      .eq("filename", filename)
      .order("uploaded_at", { ascending: false })
      .limit(1);
    const previous = existing?.[0];

    if (previous) {
      const { error: updateError } = await supabase
        .from("photos")
        .update({ storage_path: storagePath, file_type: fileType, uploaded_at: new Date().toISOString() })
        .eq("id", previous.id);
      if (updateError) throw updateError;
      await supabase.storage
        .from("photos")
        .remove([previous.storage_path, ...variantPaths(previous.storage_path)])
        .catch(() => {});
    } else {
      const { error: insertError } = await supabase.from("photos").insert({
        class_id: classId,
        storage_path: storagePath,
        filename,
        file_type: fileType,
        category,
      });
      if (insertError) throw insertError;
    }

    // _ingested лежить всередині тієї ж категорійної підпапки, щоб два
    // різні кадри з однаковою назвою з різних категорій не перезаписали одне одного.
    const dest = path.join(DROP_ROOT, classId, category, "_ingested", filename);
    await fs.promises.mkdir(path.dirname(dest), { recursive: true });
    await fs.promises.rename(filePath, dest);

    log(
      `[ftp-ingest] ✓ ${filename} -> клас ${classId}, категорія "${category}", ${folder} (${fileType})${previous ? " — замінено попередню версію" : ""}`
    );
  } catch (err) {
    log(`[ftp-ingest] ✗ помилка для ${rel}: ${err.message}`);
    const dest = path.join(DROP_ROOT, classId, category, "_errors", filename);
    await fs.promises.mkdir(path.dirname(dest), { recursive: true }).catch(() => {});
    await fs.promises.rename(filePath, dest).catch(() => {});
  }
}

// Копії вже відправлених файлів (_ingested) і обрізані (_incomplete) лежать на
// диску сервера лише як страховка — старші за 3 дні видаляємо, щоб диск не заповнився.
const KEEP_MS = 3 * 24 * 60 * 60 * 1000;
async function cleanupOld(dir = DROP_ROOT) {
  let entries = [];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      await cleanupOld(full);
    } else if (/[\\/](_ingested|_incomplete)[\\/]/.test(full)) {
      const { mtimeMs } = await fs.promises.stat(full).catch(() => ({ mtimeMs: Date.now() }));
      if (Date.now() - mtimeMs > KEEP_MS) await fs.promises.unlink(full).catch(() => {});
    }
  }
}
cleanupOld();
setInterval(cleanupOld, 6 * 60 * 60 * 1000);

// --- control-сервер: адмінка (Vercel) керує увімк/вимк і читає статус
// звідси по HTTP, бо сама тримати цей процес не може (serverless).
// Захищено спільним секретом (той самий FTP_CONTROL_SECRET на сервері й
// у Vercel) — без нього будь-хто в інтернеті міг би вимкнути прийом.
const CONTROL_PORT = Number(process.env.FTP_CONTROL_PORT || 8090);

function isAuthorized(req) {
  if (!CONTROL_SECRET) return false;
  const header = req.headers["authorization"] || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(token);
  const b = Buffer.from(CONTROL_SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const controlServer = http.createServer((req, res) => {
  if (!isAuthorized(req)) return sendJson(res, 401, { error: "unauthorized" });

  if (req.method === "GET" && req.url === "/status") {
    return sendJson(res, 200, {
      running: enabled,
      jpegOnly,
      rawRejected,
      startedAt: START_TIME,
      logs: recentLogs.slice(-50),
      host: primaryIp,
      port: FTP_PORT,
    });
  }
  if (req.method === "POST" && req.url === "/enable") {
    setEnabled(true);
    log("[control] прийом увімкнено з адмінки");
    return sendJson(res, 200, { ok: true, running: true });
  }
  if (req.method === "POST" && req.url === "/disable") {
    setEnabled(false);
    log("[control] прийом вимкнено з адмінки");
    return sendJson(res, 200, { ok: true, running: false });
  }
  if (req.method === "POST" && (req.url === "/jpeg-only/on" || req.url === "/jpeg-only/off")) {
    setJpegOnly(req.url.endsWith("/on"));
    rawRejected = 0;
    log(`[control] режим «лише JPEG» ${jpegOnly ? "УВІМКНЕНО" : "вимкнено"}`);
    return sendJson(res, 200, { ok: true, jpegOnly });
  }
  sendJson(res, 404, { error: "not found" });
});

// --- старт + інфо для налаштування камери ---
// Control-сервер піднімаємо лише коли є секрет (постійний сервер) — у
// локальному сценарії (spawn/kill з ftp-process-manager.ts) він не
// потрібен, і зайвий відкритий порт ні до чого.
const startControlServer = CONTROL_SECRET
  ? new Promise((resolve) => controlServer.listen(CONTROL_PORT, resolve))
  : Promise.resolve();

Promise.all([ftpServer.listen(), startControlServer])
  .then(() => {
    console.log("═".repeat(60));
    console.log("FTP-приймач фото запущено");
    console.log(`  Порт: ${FTP_PORT} (passive: ${PASV_MIN}-${PASV_MAX})`);
    console.log(`  Публічна/локальна адреса: ${primaryIp}`);
    console.log(`  Control-сервер: :${CONTROL_PORT} (${CONTROL_SECRET ? "захищено секретом" : "БЕЗ секрету!"})`);
    console.log(`  Прийом зараз: ${enabled ? "УВІМКНЕНО" : "вимкнено"}`);
    console.log("  Креденшли на клас дивись у адмінці: /ftp-import");
    console.log("═".repeat(60));
  })
  .catch((err) => {
    console.error("Не вдалося запустити сервер:", err.message);
    process.exit(1);
  });

process.on("SIGINT", async () => {
  await ftpServer.close();
  controlServer.close();
  process.exit(0);
});
