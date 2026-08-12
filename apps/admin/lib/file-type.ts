/**
 * Визначення типу фото-файлу (JPEG чи один із RAW-форматів) за розширенням
 * імені файлу — використовується і формою ручного завантаження
 * (app/api/photos/upload/route.ts), і майбутньою галереєю адмінки.
 *
 * Той самий список продубльований у scripts/ftp-ingest.mjs (окремий
 * Node-процес, не проходить через збірку Next.js, тому імпортувати звідси
 * напряму не може, за тим самим приводом, що й ftp-credentials.ts) —
 * тримай обидва місця синхронними. Список розширень також має збігатися
 * з check-constraint `photos_file_type_check` у
 * supabase/migrations/0003_raw_support.sql.
 */

// ext (без крапки, lowercase) -> значення, що зберігається у photos.file_type
export const RAW_EXTENSIONS: Record<string, string> = {
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

export type FileKind = "jpeg" | "raw";

/** Назва підпапки в Storage для даного узагальненого типу. */
export const FOLDER_BY_KIND: Record<FileKind, string> = {
  jpeg: "JPEG",
  raw: "RAW",
};

/**
 * Визначає file_type (точне розширення) за іменем файлу.
 * Повертає null, якщо розширення не підтримується (тоді файл слід пропустити).
 */
export function detectFileType(filename: string): string | null {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (!ext) return null;
  if (ext === "jpg" || ext === "jpeg") return "jpeg";
  return RAW_EXTENSIONS[ext] ?? null;
}

export function fileKindOf(fileType: string): FileKind {
  return fileType === "jpeg" ? "jpeg" : "raw";
}

/** Підпапка в Storage-шляху ("JPEG" або "RAW") для файлу з даним file_type. */
export function folderFor(fileType: string): string {
  return FOLDER_BY_KIND[fileKindOf(fileType)];
}
