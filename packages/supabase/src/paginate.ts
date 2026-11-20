/**
 * Supabase (PostgREST) віддає за один запит не більше 1000 рядків — решта
 * мовчки обрізається. Для списків, що можуть бути більшими (фото класу —
 * понад тисячу файлів за зйомку), читаємо сторінками по 1000.
 *
 *   const photos = await fetchAllRows((from, to) =>
 *     supabase.from("photos").select("id").eq("class_id", id).order("id").range(from, to));
 *
 * Запит має мати стабільний порядок (order), інакше сторінки можуть перекриватись.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}
