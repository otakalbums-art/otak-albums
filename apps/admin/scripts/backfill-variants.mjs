#!/usr/bin/env node
/**
 * Створює відсутні зменшені версії (thumb / preview / tiny) для JPEG-фото
 * (фото, що прийшли до появи версій). Безпечно запускати повторно — наявні пропускає.
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
import { VARIANT_SPECS, uploadVariants, variantPath } from "./photo-variants.mjs";

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

const ALL = Object.keys(VARIANT_SPECS);

/** Для кожного оригіналу — яких версій бракує (перевірка пакетним підписом). */
async function missing(paths) {
  const out = [];
  for (let i = 0; i < paths.length; i += 300) {
    const chunk = paths.slice(i, i + 300);
    const targets = chunk.flatMap((p) => ALL.map((v) => variantPath(p, v))).filter(Boolean);
    const { data } = await supabase.storage.from("photos").createSignedUrls(targets, 60);
    const ok = new Set((data ?? []).filter((d) => d.signedUrl).map((d) => d.path));
    for (const p of chunk) {
      const lack = ALL.filter((v) => variantPath(p, v) && !ok.has(variantPath(p, v)));
      if (lack.length) out.push({ path: p, lack });
    }
  }
  return out;
}

const started = Date.now();
const todo = await missing(await allJpegs());
console.log(`Фото, яким бракує версій: ${todo.length}`);

let done = 0;
let failed = 0;
async function worker() {
  while (todo.length) {
    const { path: p, lack } = todo.shift();
    // Бракує лише tiny — робимо її з готової мініатюри (кілька КБ замість ~4 МБ оригіналу).
    const source = lack.length === 1 && lack[0] === "tiny" ? variantPath(p, "thumb") : p;
    let { data: blob, error } = await supabase.storage.from("photos").download(source);
    if ((error || !blob) && source !== p) ({ data: blob, error } = await supabase.storage.from("photos").download(p));
    if (error || !blob) {
      failed++;
      console.log(`✗ не вдалось завантажити ${p}: ${error?.message}`);
      continue;
    }
    const made = await uploadVariants(supabase, p, Buffer.from(await blob.arrayBuffer()), console.log, lack);
    if (made === lack.length) done++;
    else failed++;
    if ((done + failed) % 50 === 0) console.log(`… ${done + failed} оброблено (${Math.round((Date.now() - started) / 1000)} с)`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`Готово: ${done} успішно, ${failed} з помилками, за ${Math.round((Date.now() - started) / 1000)} с`);
