/**
 * Зменшені версії JPEG-фото для швидких галерей.
 *
 *   оригінал: {class}/{category}/JPEG/{uuid}-{name}.JPG     (повний розмір, для CRM/архіву/друку)
 *   thumb:    {class}/{category}/THUMB/{uuid}-{name}.webp   (~480 px, сітка галереї)
 *   preview:  {class}/{category}/PREVIEW/{uuid}-{name}.webp (~1600 px, перегляд на весь екран)
 *
 * Шлях версії виводиться з шляху оригіналу — окремих колонок у БД не треба.
 * Якщо версії ще немає (старе фото до backfill), підписуємо оригінал.
 * Генерують версії: FTP-приймач (apps/admin/scripts/ftp-ingest.mjs — там
 * дубль цієї функції, бо це окремий Node-процес), ручне завантаження
 * (apps/admin/app/api/photos/upload) і backfill-скрипт.
 */

export type PhotoVariant = "thumb" | "preview";

export const VARIANT_SPECS: Record<PhotoVariant, { folder: string; size: number; quality: number }> = {
  thumb: { folder: "THUMB", size: 480, quality: 68 },
  preview: { folder: "PREVIEW", size: 1600, quality: 80 },
};

/** Шлях зменшеної версії або null, якщо це не JPEG-оригінал. */
export function variantPath(storagePath: string, variant: PhotoVariant): string | null {
  if (!storagePath.includes("/JPEG/")) return null;
  return storagePath.replace("/JPEG/", `/${VARIANT_SPECS[variant].folder}/`).replace(/\.[^./]+$/, ".webp");
}

type StorageLike = {
  storage: {
    from(bucket: string): {
      createSignedUrls(
        paths: string[],
        expiresIn: number
      ): PromiseLike<{ data: { path: string | null; signedUrl: string | null; error: string | null }[] | null; error: unknown }>;
    };
  };
};

/**
 * Підписані URL однією пачкою: для кожного оригіналу — версія `variant`,
 * а якщо її ще нема — сам оригінал. Повертає Map(шлях оригіналу -> URL).
 */
export async function signPhotoUrls(
  client: StorageLike,
  originals: string[],
  variant: PhotoVariant | "original",
  expiresIn = 60 * 60
): Promise<Map<string, string>> {
  const unique = [...new Set(originals.filter(Boolean))];
  const result = new Map<string, string>();
  if (!unique.length) return result;

  const wanted = unique.map((p) => (variant === "original" ? p : variantPath(p, variant) ?? p));
  const toSign = [...new Set([...wanted, ...(variant === "original" ? [] : unique)])];

  // Storage приймає не більше 1000 шляхів за запит (більше -> помилка на весь
  // запит і жодного URL), тож підписуємо пачками паралельно.
  const CHUNK = 500;
  const chunks: string[][] = [];
  for (let i = 0; i < toSign.length; i += CHUNK) chunks.push(toSign.slice(i, i + CHUNK));
  const results = await Promise.all(chunks.map((c) => client.storage.from("photos").createSignedUrls(c, expiresIn)));
  const byPath = new Map<string, string>();
  for (const { data } of results) {
    for (const d of data ?? []) if (d.signedUrl && d.path) byPath.set(d.path, d.signedUrl);
  }

  unique.forEach((orig, i) => {
    const url = byPath.get(wanted[i]) ?? byPath.get(orig);
    if (url) result.set(orig, url);
  });
  return result;
}

const filenameCollator = new Intl.Collator("uk", { numeric: true, sensitivity: "base" });

/**
 * Порядок кадрів за номером у назві файлу (R6__0738.JPG < R6__0739.JPG <
 * R6__1731.JPG): числа порівнюються як числа, а не як текст. Однакова
 * назва — JPEG раніше за RAW.
 */
export function compareFilenames(a: string, b: string) {
  return compareFrames(a, b, false);
}

/** Від нових до старих: більший номер кадру першим (JPEG усе одно раніше за свій RAW). */
export function compareFilenamesDesc(a: string, b: string) {
  return compareFrames(a, b, true);
}

function compareFrames(a: string, b: string, desc: boolean) {
  const baseA = a.replace(/\.[^.]+$/, "");
  const baseB = b.replace(/\.[^.]+$/, "");
  const byBase = filenameCollator.compare(baseA, baseB);
  if (byBase) return desc ? -byBase : byBase;
  const isJpeg = (n: string) => /\.jpe?g$/i.test(n);
  return Number(isJpeg(b)) - Number(isJpeg(a)) || filenameCollator.compare(a, b);
}
