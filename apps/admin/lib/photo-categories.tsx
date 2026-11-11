import { Camera, Folder, GraduationCap, User, Users, type LucideIcon } from "lucide-react";

/** Іконка для кожної категорії фото (portrait/group/ceremony/personal/uncategorized). */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  portrait: Camera,
  group: Users,
  ceremony: GraduationCap,
  personal: User,
  uncategorized: Folder,
};

export function CategoryIcon({ category, className = "h-3.5 w-3.5" }: { category: string; className?: string }) {
  const Icon = CATEGORY_ICONS[category] ?? Folder;
  return <Icon className={className} aria-hidden />;
}
