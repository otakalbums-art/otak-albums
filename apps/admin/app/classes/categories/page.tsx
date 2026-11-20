import { Card } from "@otak/ui";
import { CategoriesEditor } from "./categories-editor";

export const dynamic = "force-dynamic";

/** «Класи та групи» → «Категорії фото» (supabase/migrations/0018_photo_categories.sql). */
export default function PhotoCategoriesPage() {
  return (
    <div>
      <a href="/classes" className="mb-3 inline-block text-xs font-semibold text-purple hover:underline">
        ← Класи та групи
      </a>
      <Card title="Категорії фото" menu={false}>
        <CategoriesEditor />
      </Card>
    </div>
  );
}
