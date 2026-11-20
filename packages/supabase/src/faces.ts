/**
 * Обличчя на фото (supabase/migrations/0019_faces.sql). Відбитки рахує
 * apps/admin/scripts/face-worker.py (OpenCV SFace, 128 чисел, нормовані).
 *
 * Пошук дитини працює «серіями»: фотограф знімає дитину серією сусідніх
 * кадрів, тож усереднений відбиток серії набагато надійніший за один кадр
 * (на тесті «Старша 1»: серії однієї дитини 0.89–0.98, різних — до 0.69).
 */
import { fetchAllRows } from "./paginate";
import { compareFilenames } from "./photo-variants";

export type FaceRow = { photo_id: string; face_index: number; box: number[]; embedding: number[] };
export type FacePhoto = { id: string; filename: string };

/** Пороги підібрані на реальних фото (див. опис вище). */
export const FACE_THRESHOLDS = {
  seriesLink: 0.45, // сусідні кадри — одна серія, якщо схожість ≥ цього
  seriesGap: 8, // і різниця номерів кадрів ≤ цього
  seriesMatch: 0.75, // серія — та сама дитина, що й запит
  faceMatch: 0.6, // окреме обличчя (напр. на груповому фото) — та сама дитина
};

function dot(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
function normalize(v: number[]) {
  const n = Math.sqrt(dot(v, v)) || 1;
  return v.map((x) => x / n);
}
function mean(vs: number[][]) {
  const out = new Array(vs[0].length).fill(0);
  for (const v of vs) for (let i = 0; i < v.length; i++) out[i] += v[i];
  return normalize(out);
}
function frameNumber(filename: string) {
  const all = filename.match(/\d+/g);
  return all ? Number(all[all.length - 1]) : -1;
}

/** Усі обличчя класу (сторінками — їх може бути понад тисячу). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadClassFaces(supabase: any, classId: string): Promise<FaceRow[]> {
  return fetchAllRows<FaceRow>((from, to) =>
    supabase
      .from("photo_faces")
      .select("photo_id, face_index, box, embedding")
      .eq("class_id", classId)
      .order("id")
      .range(from, to)
  );
}

/**
 * Фото, на яких та сама дитина, що й обличчя faceIndex на фото photoId.
 * photos — фото, які можна показати (видимі батькам JPEG класу).
 */
export function findChildPhotos(photos: FacePhoto[], faces: FaceRow[], photoId: string, faceIndex: number) {
  const T = FACE_THRESHOLDS;
  const visible = new Map(photos.map((p) => [p.id, p]));
  const byPhoto = new Map<string, FaceRow[]>();
  for (const f of faces) {
    if (!visible.has(f.photo_id)) continue;
    const list = byPhoto.get(f.photo_id) ?? [];
    list.push({ ...f, embedding: normalize(f.embedding) });
    byPhoto.set(f.photo_id, list);
  }
  const selected = byPhoto.get(photoId)?.find((f) => f.face_index === faceIndex);
  if (!selected) return null;

  // Серії за головним (найбільшим, face_index 0) обличчям кадру, у порядку номерів кадрів.
  const ordered = photos
    .filter((p) => byPhoto.get(p.id)?.some((f) => f.face_index === 0))
    .sort((a, b) => compareFilenames(a.filename, b.filename));
  const series: { ids: string[]; embs: number[][] }[] = [];
  let prev: { frame: number; emb: number[] } | null = null;
  for (const p of ordered) {
    const emb = byPhoto.get(p.id)!.find((f) => f.face_index === 0)!.embedding;
    const frame = frameNumber(p.filename);
    if (prev && frame - prev.frame <= T.seriesGap && dot(emb, prev.emb) >= T.seriesLink) {
      series[series.length - 1].ids.push(p.id);
      series[series.length - 1].embs.push(emb);
    } else {
      series.push({ ids: [p.id], embs: [emb] });
    }
    prev = { frame, emb };
  }
  const centroids = series.map((s) => mean(s.embs));

  // Запит: серія, до якої належить обране обличчя (або найсхожіша серія для
  // обличчя з групового фото); якщо такої немає — саме обличчя.
  let query = selected.embedding;
  const own = selected.face_index === 0 ? series.findIndex((s) => s.ids.includes(photoId)) : -1;
  if (own >= 0) {
    query = centroids[own];
  } else {
    let best = -1;
    let bestSim = T.seriesMatch;
    centroids.forEach((c, i) => {
      const s = dot(c, selected.embedding);
      if (s >= bestSim) {
        best = i;
        bestSim = s;
      }
    });
    if (best >= 0) query = centroids[best];
  }

  const result = new Set<string>([photoId]);
  centroids.forEach((c, i) => {
    if (dot(c, query) >= T.seriesMatch) series[i].ids.forEach((id) => result.add(id));
  });
  for (const [pid, list] of byPhoto) {
    if (list.some((f) => dot(f.embedding, query) >= T.faceMatch)) result.add(pid);
  }
  return [...result];
}

/** Ціль автосортування для кадру з count облич за правилами категорій (або null). */
export function autoSortTarget(
  category: string,
  count: number,
  rules: { single?: string; multi?: string }
): string | null {
  const eligible = new Set([rules.single, rules.multi, "uncategorized"].filter(Boolean) as string[]);
  const target = count === 1 ? rules.single : count >= 2 ? rules.multi : undefined;
  return target && eligible.has(category) && category !== target ? target : null;
}
