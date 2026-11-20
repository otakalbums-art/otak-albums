/**
 * Категорії фото (supabase/migrations/0018_photo_categories.sql) — керуються
 * з адмінки. Тут — завантаження списку для обох сайтів із запасним
 * вбудованим списком, якщо таблиця раптом недоступна.
 */
export type PhotoCategory = {
  key: string;
  label: string;
  sort_order: number;
  hidden_from_parents: boolean;
  is_system: boolean;
};

export const DEFAULT_PHOTO_CATEGORIES: PhotoCategory[] = [
  { key: "portrait", label: "Портрети", sort_order: 1, hidden_from_parents: false, is_system: false },
  { key: "group", label: "Групові", sort_order: 2, hidden_from_parents: false, is_system: false },
  { key: "ceremony", label: "Церемонія", sort_order: 3, hidden_from_parents: false, is_system: false },
  { key: "personal", label: "Персональні", sort_order: 4, hidden_from_parents: false, is_system: true },
  { key: "uncategorized", label: "Без категорії", sort_order: 5, hidden_from_parents: false, is_system: true },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadPhotoCategories(supabase: any): Promise<PhotoCategory[]> {
  const { data, error } = await supabase
    .from("photo_categories")
    .select("key, label, sort_order, hidden_from_parents, is_system")
    .order("sort_order")
    .order("created_at");
  if (error || !data?.length) return DEFAULT_PHOTO_CATEGORIES;
  return data as PhotoCategory[];
}

/** Ключі категорій, фото з яких батькам не показуються. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function hiddenCategoryKeys(supabase: any): Promise<string[]> {
  return (await loadPhotoCategories(supabase)).filter((c) => c.hidden_from_parents).map((c) => c.key);
}

/** Для PostgREST-фільтра .not("category", "in", ...) — `("a","b")`. */
export function inList(keys: string[]) {
  return `(${keys.map((k) => `"${k}"`).join(",")})`;
}
