"use client";

import { useState } from "react";
import { Loader2, ScanFace, X } from "lucide-react";

type Face = { face_index: number; box: number[] };

/**
 * «Знайти мою дитину» у перегляді фото: бере обличчя з фото (якщо їх кілька —
 * батьки вибирають своє), за потреби питає згоду на обробку обличчя й шукає
 * всі фото цієї дитини (/api/faces/search). Результат — список id фото.
 */
export function FaceSearchButton({
  photoId,
  imageUrl,
  consent,
  onConsentGiven,
  onResult,
}: {
  photoId: string;
  imageUrl?: string;
  consent: boolean;
  onConsentGiven: () => void;
  onResult: (ids: string[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [picker, setPicker] = useState<Face[] | null>(null);
  const [askConsentFor, setAskConsentFor] = useState<number | null>(null);

  async function search(faceIndex: number) {
    if (!consent) {
      setAskConsentFor(faceIndex);
      return;
    }
    setBusy(true);
    setNote(null);
    const res = await fetch("/api/faces/search", { method: "POST", body: JSON.stringify({ photoId, faceIndex }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (data.needConsent) return setAskConsentFor(faceIndex);
    if (!res.ok) return setNote(data.error ?? "Не вдалося виконати пошук");
    setPicker(null);
    onResult(data.ids ?? []);
  }

  async function start() {
    setBusy(true);
    setNote(null);
    const res = await fetch(`/api/faces/${photoId}`);
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setNote(data.error ?? "Не вдалося отримати обличчя");
    if (!data.analyzed) return setNote("Це фото ще обробляється — спробуйте за кілька хвилин.");
    const faces: Face[] = data.faces ?? [];
    if (!faces.length) return setNote("На цьому фото не знайдено облич — відкрийте фото, де обличчя дитини добре видно.");
    if (faces.length === 1) return search(faces[0].face_index);
    setPicker(faces);
  }

  async function agree() {
    const faceIndex = askConsentFor;
    setBusy(true);
    const res = await fetch("/api/faces/consent", { method: "POST" });
    setBusy(false);
    if (!res.ok) return setNote("Не вдалося зберегти згоду — спробуйте ще раз.");
    setAskConsentFor(null);
    onConsentGiven();
    if (faceIndex !== null) {
      // consent у пропсах оновиться лише після рендеру — шукаємо одразу.
      setBusy(true);
      const r = await fetch("/api/faces/search", { method: "POST", body: JSON.stringify({ photoId, faceIndex }) });
      const data = await r.json().catch(() => ({}));
      setBusy(false);
      if (!r.ok) return setNote(data.error ?? "Не вдалося виконати пошук");
      setPicker(null);
      onResult(data.ids ?? []);
    }
  }

  return (
    <>
      <button
        onClick={start}
        disabled={busy}
        className="inline-flex items-center gap-1.5 text-sm font-bold text-white/80 hover:text-white disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanFace className="h-4 w-4" />}
        Знайти мою дитину
      </button>

      {note && (
        <div className="absolute -top-12 left-1/2 w-max max-w-[86vw] -translate-x-1/2 rounded-lg bg-white px-3 py-2 text-center text-xs font-semibold text-ink shadow-lg">
          {note}
        </div>
      )}

      {picker && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={() => setPicker(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-card p-4 shadow-card">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold">Хто ваша дитина на цьому фото?</h3>
              <button onClick={() => setPicker(null)} aria-label="Закрити" className="text-ink-soft">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              {picker.map((f) => (
                <button
                  key={f.face_index}
                  onClick={() => search(f.face_index)}
                  disabled={busy}
                  className="h-24 w-24 overflow-hidden rounded-full border-[3px] border-line bg-page bg-no-repeat transition-colors hover:border-purple"
                  style={faceCropStyle(imageUrl, f.box)}
                  aria-label={`Обличчя ${f.face_index + 1}`}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {askConsentFor !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-card p-5 shadow-card">
            <h3 className="mb-2 flex items-center gap-1.5 text-[15px] font-bold">
              <ScanFace className="h-5 w-5 text-purple" /> Пошук дитини за обличчям
            </h3>
            <div className="space-y-2 text-[13px] text-ink-soft">
              <p>
                Щоб показати всі фото вашої дитини, система порівнює її обличчя з обличчями на інших фото цієї зйомки.
              </p>
              <ul className="ml-4 list-disc space-y-1">
                <li>Обробка відбувається на серверах Otak Albums і нікому не передається.</li>
                <li>Використовується лише для пошуку фото в межах вашого класу чи групи.</li>
                <li>Згоду можна відкликати будь-коли внизу сторінки галереї.</li>
                <li>Пошук може помилятися — інколи покаже зайве фото або пропустить потрібне.</li>
              </ul>
            </div>
            <label className="mt-4 flex items-start gap-2 rounded-[10px] bg-purple-pale p-3 text-[13px] font-semibold text-purple-deep">
              <ScanFace className="mt-px h-4 w-4 flex-shrink-0" />
              Дозволяю обробку обличчя моєї дитини для пошуку її фото
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setAskConsentFor(null)}
                disabled={busy}
                className="rounded-[9px] px-3 py-2 text-[13px] font-semibold text-ink-soft"
              >
                Скасувати
              </button>
              <button
                onClick={agree}
                disabled={busy}
                className="rounded-[9px] bg-purple px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
              >
                {busy ? "Зберігаємо…" : "Погоджуюсь"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Кругле прев'ю обличчя: фон — те саме фото, збільшене й зсунуте на рамку обличчя (з полями). */
function faceCropStyle(url: string | undefined, box: number[]) {
  if (!url) return {};
  const [x, y, w, h] = box;
  const pad = 0.35;
  const bw = Math.min(1, w * (1 + 2 * pad));
  const bh = Math.min(1, h * (1 + 2 * pad));
  const bx = Math.max(0, Math.min(1 - bw, x - w * pad));
  const by = Math.max(0, Math.min(1 - bh, y - h * pad));
  return {
    backgroundImage: `url(${url})`,
    backgroundSize: `${100 / bw}% ${100 / bh}%`,
    backgroundPosition: `${bw < 1 ? (bx / (1 - bw)) * 100 : 0}% ${bh < 1 ? (by / (1 - bh)) * 100 : 0}%`,
  };
}
