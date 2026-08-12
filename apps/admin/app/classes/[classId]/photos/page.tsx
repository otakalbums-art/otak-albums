import { createSupabaseServerClient } from "@otak/supabase";
import { Card } from "@otak/ui";
import { notFound } from "next/navigation";
import { PhotosGallery } from "./photos-gallery";

/**
 * Галерея фото класу для адмінки — на відміну від учнівської
 * (apps/client/app/gallery), показує і JPEG, і RAW (docs/camera-ftp-ingest.md).
 */
export default async function ClassPhotosPage({ params }: { params: { classId: string } }) {
  const supabase = createSupabaseServerClient();

  const { data: klass } = await supabase
    .from("classes")
    .select("id, name, schools(name)")
    .eq("id", params.classId)
    .maybeSingle();

  if (!klass) notFound();

  return (
    <Card title={`Фото — ${klass.name}, ${(klass as any).schools?.name ?? ""}`} menu={false}>
      <PhotosGallery classId={klass.id} />
    </Card>
  );
}
