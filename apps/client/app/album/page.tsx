"use client";

import { useEffect, useState } from "react";
import { Card, Button } from "@otak/ui";
import { PhotoPicker } from "./photo-picker";
import { redirectToLogin } from "@/lib/session-redirect";

type Photo = { id: string; filename: string; url: string | null };
type Slot = { id: string; label: string; max_photos: number; sort_order: number };
type TextSlot = { id: string; key: string; label: string };

/**
 * "Сформувати альбом" — учень заповнює ті самі CRM-слоти (Портрет 1,
 * Фото 1 студія...), що налаштовані для типу альбому його класу, обираючи
 * фото зі свого "Обраного" (apps/client/app/gallery). Обмеження "не
 * більше й не менше" тримається самою структурою слотів — просто немає
 * зайвого місця, куди покласти більше фото, ніж треба.
 *
 * Внизу — дубль текстових слотів (Цитата тощо) з /profile: та сама
 * анкета, той самий /api/profile, просто щоб не змушувати учня йти на
 * окрему сторінку одразу після того, як він щойно закінчив підбирати фото
 * тут же. Підтвердження відбору (нижче) стосується лише фото-слотів — як
 * і раніше, текстові поля не блокують і не потрібні для "Підтвердити
 * відбір" (перевіряє лише /api/album-slots/confirm на сервері).
 */
export default function AlbumPage() {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [assignments, setAssignments] = useState<Record<string, Photo[]>>({});
  const [favorites, setFavorites] = useState<Photo[]>([]);
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null);
  const [pickerSlot, setPickerSlot] = useState<Slot | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const [textSlots, setTextSlots] = useState<TextSlot[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [textStatus, setTextStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [textError, setTextError] = useState<string | null>(null);

  function refetch() {
    return fetch("/api/album-slots")
      .then((r) => {
        if (r.status === 401) {
          redirectToLogin();
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (!data) return;
        setSlots(data.slots ?? []);
        setAssignments(data.assignments ?? {});
        setFavorites(data.favorites ?? []);
        setConfirmedAt(data.confirmedAt ?? null);
      })
      .catch(() => {});
  }

  useEffect(() => {
    refetch();
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setTextSlots(data.slots ?? []);
        setAnswers(data.answers ?? {});
      })
      .catch(() => {});
  }, []);

  async function handleTextSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTextStatus("saving");
    setTextError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      if (res.status === 401) {
        redirectToLogin();
        return;
      }
      if (!res.ok) throw new Error("Не вдалося зберегти");
      setTextStatus("saved");
    } catch {
      setTextError("Не вдалося зберегти. Спробуй ще раз.");
      setTextStatus("idle");
    }
  }

  async function saveSlot(slotId: string, photoIds: string[]) {
    await fetch(`/api/album-slots/${slotId}`, { method: "PUT", body: JSON.stringify({ photoIds }) });
    setPickerSlot(null);
    setConfirmMessage(null);
    await refetch();
  }

  async function handleConfirm() {
    setConfirming(true);
    setConfirmMessage(null);
    const res = await fetch("/api/album-slots/confirm", { method: "POST" });
    const data = await res.json();
    setConfirming(false);
    setConfirmMessage(res.ok ? { type: "ok", text: "Відбір підтверджено — фотограф побачить саме ці фото." } : { type: "error", text: data.error ?? "Не вдалося підтвердити." });
    if (res.ok) await refetch();
  }

  if (slots === null) return <p className="text-sm text-ink-soft">Завантажуємо…</p>;

  if (slots.length === 0) {
    return (
      <Card menu={false}>
        <p className="text-sm text-ink-soft">
          Для типу альбому твого класу ще не налаштовано жодного фото-слота — зверніся до фотографа.
        </p>
      </Card>
    );
  }

  const filledCount = slots.filter((s) => (assignments[s.id]?.length ?? 0) > 0).length;
  const allFilled = filledCount === slots.length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold">Сформувати альбом</h1>
          <p className="text-xs text-ink-soft">
            Обирай фото зі свого ★ обраного під кожне місце в альбомі. Заповнено {filledCount}/{slots.length}.
          </p>
        </div>
        {confirmedAt && (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#E7F7EE] px-3 py-1.5 text-[11.5px] font-bold text-ok">
            ✓ Підтверджено
          </span>
        )}
      </div>

      {favorites.length === 0 && (
        <p className="mb-4 rounded-[10px] bg-purple-pale p-3.5 text-xs text-ink-soft">
          У тебе ще немає обраних фото — спершу зайди в{" "}
          <a href="/gallery" className="font-semibold text-purple hover:underline">
            галерею
          </a>{" "}
          і познач потрібні фото зіркою ★.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {slots.map((slot) => {
          const photos = assignments[slot.id] ?? [];
          return (
            <button
              key={slot.id}
              onClick={() => setPickerSlot(slot)}
              className="flex flex-col items-start gap-2 rounded-xl border border-line bg-card p-3 text-left hover:border-purple-soft"
            >
              <span className="text-[12.5px] font-bold">{slot.label}</span>
              {photos.length === 0 ? (
                <span className="flex aspect-[4/5] w-full items-center justify-center rounded-[9px] border border-dashed border-line text-[11px] text-ink-soft">
                  + Обрати
                </span>
              ) : (
                <span
                  className="aspect-[4/5] w-full rounded-[9px] border border-line bg-cover bg-center"
                  style={photos[0].url ? { backgroundImage: `url(${photos[0].url})` } : undefined}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-5">
        <Button onClick={handleConfirm} disabled={!allFilled || confirming} className="w-auto">
          {confirming ? "Підтверджуємо…" : "Підтвердити відбір"}
        </Button>
        {!allFilled && <p className="mt-1.5 text-[11.5px] text-ink-soft">Заповни всі місця вище, щоб підтвердити.</p>}
        {confirmMessage && (
          <p className={`mt-2 text-[12.5px] font-semibold ${confirmMessage.type === "ok" ? "text-ok" : "text-warn"}`}>
            {confirmMessage.text}
          </p>
        )}
      </div>

      {pickerSlot && (
        <PhotoPicker
          slotLabel={pickerSlot.label}
          maxPhotos={pickerSlot.max_photos}
          photos={favorites}
          initialPhotoIds={(assignments[pickerSlot.id] ?? []).map((p) => p.id)}
          onSave={(photoIds) => saveSlot(pickerSlot.id, photoIds)}
          onClose={() => setPickerSlot(null)}
        />
      )}

      {textSlots && textSlots.length > 0 && (
        <Card title={null} menu={false} className="mt-6">
          <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-soft">Анкета</div>
          <h2 className="mb-1.5 text-lg font-bold">Твоя сторінка в альбомі</h2>
          <p className="mb-5 text-[13.5px] text-ink-soft">
            Ці відповіді підуть на твою сторінку в альбомі — заповни те, що хочеш бачити надрукованим
            (те саме можна редагувати і в{" "}
            <a href="/profile" className="font-semibold text-purple hover:underline">
              профілі
            </a>
            ).
          </p>
          <form onSubmit={handleTextSubmit}>
            {textSlots.map((slot) => (
              <div key={slot.id} className="mb-3.5">
                <label className="mb-1.5 block text-[11.5px] font-semibold text-ink-soft">{slot.label}</label>
                <textarea
                  value={answers[slot.id] ?? ""}
                  onChange={(e) => setAnswers((prev) => ({ ...prev, [slot.id]: e.target.value }))}
                  rows={2}
                  className="w-full rounded-[9px] border-[1.5px] border-line bg-page px-3.5 py-[11px] text-[13.5px] focus:border-purple focus:bg-white focus:outline-none"
                />
              </div>
            ))}
            {textError && <p className="mb-3 text-[12.5px] text-warn">{textError}</p>}
            <Button type="submit" disabled={textStatus === "saving"} className="w-auto">
              {textStatus === "saving" ? "Зберігаємо…" : textStatus === "saved" ? "✓ Збережено" : "Зберегти"}
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
