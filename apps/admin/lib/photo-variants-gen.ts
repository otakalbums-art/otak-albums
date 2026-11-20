import sharp from "sharp";
import { VARIANT_SPECS, variantPath, type PhotoVariant } from "@otak/supabase/photo-variants";

type StorageClient = {
  storage: {
    from(bucket: string): {
      upload(path: string, body: Buffer, opts: { contentType: string; upsert: boolean }): PromiseLike<{ error: unknown }>;
    };
  };
};

/**
 * Мініатюра й preview для щойно завантаженого JPEG (ручне завантаження в
 * адмінці). Та сама логіка, що й apps/admin/scripts/photo-variants.mjs для
 * сервера камер. Помилки не прокидає — без версій галерея покаже оригінал.
 */
export async function uploadVariants(client: StorageClient, storagePath: string, jpeg: Uint8Array) {
  for (const variant of Object.keys(VARIANT_SPECS) as PhotoVariant[]) {
    const target = variantPath(storagePath, variant);
    if (!target) continue;
    const { size, quality } = VARIANT_SPECS[variant];
    try {
      const out = await sharp(jpeg, { failOn: "none" })
        .rotate()
        .resize({ width: size, height: size, fit: "inside", withoutEnlargement: true })
        .webp({ quality })
        .toBuffer();
      await client.storage.from("photos").upload(target, out, { contentType: "image/webp", upsert: true });
    } catch (err) {
      console.error(`[variants] ${variant} для ${storagePath}:`, err);
    }
  }
}
