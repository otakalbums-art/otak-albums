#!/usr/bin/env node
/**
 * Створює мініатюри/preview для JPEG-фото, у яких їх ще немає (фото, що
 * прийшли до появи версій). Безпечно запускати повторно — наявні пропускає.
 *
 *   node scripts/backfill-variants.mjs            # усі класи
 *   node scripts/backfill-variants.mjs <classId>  # один клас
 *
 * Читає NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY з .env.local
 * (як ftp-ingest.mjs). Найшвидше — на сервері прийому (близько до Supabase).
 */
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import { uploadVariants, variantPath } from "./photo-variants.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.existsSync(path.join(ROOT, ".env.local")) ? fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/) : []) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const classId = process.argv[2];
const CONCURRENCY = 3;

async function allJpegs() {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase.from("photos").select("storage_path").eq("file_type", "jpeg").range(from, from + 999);
    if (classId) q = q.eq("class_id", classId);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows.map((r) => r.storage_path);
}

/** Оригінали, у яких бракує thumb або preview (перевірка одним пакетним підписом). */
async function missing(paths) {
  const out = [];
  for (let i = 0; i < paths.length; i += 500) {
    const chunk = paths.slice(i, i + 500);
    const targets = chunk.flatMap((p) => [variantPath(p, "thumb"), variantPath(p, "preview")]);
    const { data } = await supabase.storage.from("photos").createSignedUrls(targets, 60);
    const ok = new Set((data ?? []).filter((d) => d.signedUrl).map((d) => d.path));
    for (const p of chunk) {
      if (!ok.has(variantPath(p, "thumb")) || !ok.has(variantPath(p, "preview"))) out.push(p);
    }
  }
  return out;
}

const started = Date.now();
const todo = await missing(await allJpegs());
console.log(`Без мініатюр: ${todo.length}`);

let done = 0;
let failed = 0;
async function worker() {
  while (todo.length) {
    const p = todo.shift();
    const { data: blob, error } = await supabase.storage.from("photos").download(p);
    if (error || !blob) {
      failed++;
      console.log(`✗ не вдалось завантажити ${p}: ${error?.message}`);
      continue;
    }
    const made = await uploadVariants(supabase, p, Buffer.from(await blob.arrayBuffer()));
    if (made === 2) done++;
    else failed++;
    if ((done + failed) % 25 === 0) console.log(`… ${done + failed} оброблено (${Math.round((Date.now() - started) / 1000)} с)`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`Готово: ${done} успішно, ${failed} з помилками, за ${Math.round((Date.now() - started) / 1000)} с`);
