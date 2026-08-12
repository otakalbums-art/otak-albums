/**
 * Транслітерація кирилиці в латиницю — спільна база для генерації
 * referral_code класу (apps/admin/app/api/classes/route.ts) і машинних
 * ключів CRM-слотів (apps/admin/app/api/album-types/[albumTypeId]/slots).
 */
export const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "h", д: "d", е: "e", є: "ie", ж: "zh", з: "z",
  и: "y", і: "i", ї: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o",
  п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch",
  ш: "sh", щ: "shch", ю: "iu", я: "ia", ь: "",
};

export function transliterate(text: string): string {
  return text
    .toLowerCase()
    .split("")
    .map((ch) => CYRILLIC_TO_LATIN[ch] ?? ch)
    .join("");
}

/** "Портрет 1" -> "portret-1" — читабельний ключ для album_type_slots.key. */
export function slotKeySlug(label: string): string {
  return transliterate(label).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "slot";
}
