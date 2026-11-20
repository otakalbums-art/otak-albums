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
  const { data } = await client.storage.from("photos").createSignedUrls(toSign, expiresIn);
  const byPath = new Map((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path!, d.signedUrl!]));

  unique.forEach((orig, i) => {
    const url = byPath.get(wanted[i]) ?? byPath.get(orig);
    if (url) result.set(orig, url);
  });
  return result;
}
