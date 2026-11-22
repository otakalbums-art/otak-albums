/**
 * Зменшені версії JPEG для швидких галерей — для окремих Node-процесів
 * (ftp-ingest.mjs, backfill-variants.mjs). Шляхи й розміри мають збігатися з
 * packages/supabase/src/photo-variants.ts (там те саме для Next.js-коду).
 *
 *   {class}/{category}/JPEG/{name}.JPG  ->  .../THUMB/{name}.webp   (~480 px)
 *                                       ->  .../PREVIEW/{name}.webp (~1600 px)
 *                                       ->  .../TINY/{name}.webp    (~160 px, коли батькам вимкнено завантаження)
 */
import sharp from "sharp";

// Один процесор на сервері камер — не даємо libvips забрати всі потоки й пам'ять.
sharp.concurrency(1);
sharp.cache(false);

export const VARIANT_SPECS = {
  thumb: { folder: "THUMB", size: 480, quality: 68 },
  preview: { folder: "PREVIEW", size: 1600, quality: 80 },
  tiny: { folder: "TINY", size: 160, quality: 55 },
};

export function variantPath(storagePath, variant) {
  if (!storagePath.includes("/JPEG/")) return null;
  return storagePath.replace("/JPEG/", `/${VARIANT_SPECS[variant].folder}/`).replace(/\.[^./]+$/, ".webp");
}

/**
 * Створює й вивантажує версії (усі або лише `only`) для JPEG-оригіналу.
 * `imageBytes` — оригінал або вже зменшена копія (для tiny достатньо thumb).
 * Повертає кількість успішно створених версій; помилки не прокидає.
 */
export async function uploadVariants(supabase, storagePath, imageBytes, log = console.log, only = Object.keys(VARIANT_SPECS)) {
  let made = 0;
  for (const variant of only) {
    const target = variantPath(storagePath, variant);
    if (!target) continue;
    const { size, quality } = VARIANT_SPECS[variant];
    try {
      const out = await sharp(imageBytes, { failOn: "none" })
        .rotate() // EXIF-орієнтація, інакше вертикальні кадри ляжуть боком
        .resize({ width: size, height: size, fit: "inside", withoutEnlargement: true })
        .webp({ quality })
        .toBuffer();
      const { error } = await supabase.storage
        .from("photos")
        .upload(target, out, { contentType: "image/webp", upsert: true });
      if (error) throw error;
      made++;
    } catch (err) {
      log(`[variants] ✗ ${variant} для ${storagePath}: ${err.message}`);
    }
  }
  return made;
}

/** Шляхи версій оригіналу — щоб прибрати їх разом зі старим файлом. */
export function variantPaths(storagePath) {
  return Object.keys(VARIANT_SPECS)
    .map((v) => variantPath(storagePath, v))
    .filter(Boolean);
}
