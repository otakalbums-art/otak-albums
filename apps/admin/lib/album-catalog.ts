/**
 * Спільна валідація для додаткових опцій (album_options) і націнок за малий
 * тираж (album_small_run_markups) — POST і PATCH приймають ті самі поля,
 * тому розбір тіла запиту тут, а не в кожному роуті.
 * Повертає { values } або { error } (текст для адміна).
 */

function toNumberOrNull(v: unknown): number | null | "invalid" {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : "invalid";
}

export function parseOptionBody(body: any, partial: boolean) {
  const values: Record<string, unknown> = {};
  if (body.name !== undefined || !partial) {
    if (!body.name?.trim()) return { error: "Вкажіть назву опції" };
    values.name = body.name.trim();
  }
  if (body.category !== undefined) values.category = body.category?.trim() || null;
  if (body.price !== undefined) {
    const price = toNumberOrNull(body.price);
    if (price === "invalid" || (price !== null && price < 0)) return { error: "Невірна ціна" };
    values.price = price;
  }
  if (body.sortOrder !== undefined) values.sort_order = Number(body.sortOrder) || 0;
  return { values };
}

export function parseMarkupBody(body: any, partial: boolean) {
  const values: Record<string, unknown> = {};
  for (const [field, column] of [
    ["minAlbums", "min_albums"],
    ["maxAlbums", "max_albums"],
  ] as const) {
    if (body[field] === undefined) continue;
    const n = toNumberOrNull(body[field]);
    if (n === "invalid" || (n !== null && (n < 0 || !Number.isInteger(n)))) return { error: "Кількість альбомів — ціле число" };
    values[column] = n;
  }
  if (
    typeof values.min_albums === "number" &&
    typeof values.max_albums === "number" &&
    values.min_albums > values.max_albums
  ) {
    return { error: "\"Від\" не може бути більше за \"до\"" };
  }
  if (body.surcharge !== undefined || !partial) {
    const s = toNumberOrNull(body.surcharge);
    if (s === null || s === "invalid") return { error: "Вкажіть суму націнки" };
    values.surcharge = s;
  }
  if (body.sortOrder !== undefined) values.sort_order = Number(body.sortOrder) || 0;
  return { values };
}
