import { createSupabaseServerClient } from "@otak/supabase";
import { Card } from "@otak/ui";
import { notFound } from "next/navigation";
import { UploadForm } from "./upload-form";

/** Завантаження фото для конкретного класу. Категорія обирається вручну під час завантаження. */
export default async function ClassUploadPage({ params }: { params: { classId: string } }) {
  const supabase = createSupabaseServerClient();

  const { data: klass } = await supabase
    .from("classes")
    .select("id, name, schools(name)")
    .eq("id", params.classId)
    .maybeSingle();

  if (!klass) notFound();

  const { data: students } = await supabase
    .from("students")
    .select("id, first_name, last_name")
    .eq("class_id", params.classId)
    .order("last_name");

  return (
    <Card title={`Завантаження фото — ${klass.name}, ${(klass as any).schools?.name ?? ""}`} menu={false}>
      <UploadForm classId={klass.id} students={students ?? []} />
    </Card>
  );
}
