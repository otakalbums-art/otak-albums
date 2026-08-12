"use client";

import { useEffect, useMemo, useState } from "react";
import { PhotoPicker } from "./photo-picker";

type Slot = {
  id: string;
  key: string;
  label: string;
  kind: "photo" | "text";
  max_photos: number;
  filled_by: "admin" | "student";
  sort_order: number;
};

type PhotoValue = { kind: "photo"; photos: { id: string; filename: string; url: string | null }[] };
type TextValue = { kind: "text"; answer: string };

type OrderStatus = "not_ordered" | "ordered" | "partially_paid" | "paid" | "free";

type Student = {
  id: string;
  first_name: string;
  last_name: string;
  is_staff: boolean;
  staff_role: string | null;
  order_status: OrderStatus;
  order_amount: number | null;
  paid_amount: number;
  selection_confirmed_at: string | null;
  values: Record<string, PhotoValue | TextValue>;
};

const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  not_ordered: "Не замовлено",
  ordered: "Замовлено",
  partially_paid: "Частково оплачено",
  paid: "Оплачено",
  free: "Безкоштовно",
};
const ORDER_STATUS_STYLE: Record<OrderStatus, string> = {
  not_ordered: "bg-line text-ink-soft",
  ordered: "bg-[#FFF4D6] text-[#8A6D00]",
  partially_paid: "bg-[#FFE8D1] text-[#A05A00]",
  paid: "bg-[#E7F7EE] text-ok",
  free: "bg-[#DCEEFF] text-[#0A5FA8]",
};

const STAFF_ROLE_PRESETS = ["Класний керівник", "Директор"];

function isFilled(value: PhotoValue | TextValue | undefined) {
  if (!value) return false;
  return value.kind === "photo" ? value.photos.length > 0 : value.answer.trim().length > 0;
}

/** Компактна шкала прогресу — той самий стиль, що й на дашборді (apps/admin/app/page.tsx). */
function ProgressBar({ done, total }: { done: number; total: number }) {
  const percent = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="w-[92px]">
      <div className="h-1.5 overflow-hidden rounded-full bg-purple-pale">
        <div className="h-full bg-purple" style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-1 whitespace-nowrap text-[10.5px] text-ink-soft">
        {done}/{total}
      </div>
    </div>
  );
}

/** Клітинка з текстовим слотом — клік перемикає в режим редагування; порожнє значення показане як "-". */
function TextCell({
  value,
  filledByStudent,
  onSave,
}: {
  value: string;
  filledByStudent: boolean;
  onSave: (next: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  async function save() {
    setSaving(true);
    await onSave(draft);
    setSaving(false);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex min-w-[160px] flex-col gap-1">
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          className="w-full rounded-[7px] border border-line bg-page px-2 py-1 text-[12px] outline-none focus:border-purple focus:bg-white"
        />
        <div className="flex gap-1.5">
          <button onClick={save} disabled={saving} className="text-[11px] font-bold text-purple hover:underline">
            {saving ? "…" : "Зберегти"}
          </button>
          <button onClick={() => setEditing(false)} className="text-[11px] text-ink-soft hover:underline">
            Скасувати
          </button>
        </div>
      </div>
    );
  }

  return (
    <button onClick={() => setEditing(true)} className="min-w-[140px] max-w-[220px] text-left hover:text-purple">
      <span className="text-[12.5px]">{value ? value : "-"}</span>
      {filledByStudent && value && (
        <span className="ml-1.5 rounded-full bg-purple-pale px-1.5 py-0.5 text-[9.5px] font-bold text-purple-deep">
          від учня
        </span>
      )}
    </button>
  );
}

function PhotoCell({
  photos,
  onEdit,
}: {
  photos: { id: string; filename: string; url: string | null }[];
  onEdit: () => void;
}) {
  return (
    <button onClick={onEdit} className="flex items-start gap-1.5 text-left">
      {photos.length === 0 ? (
        <span className="text-[13px] text-ink-soft hover:text-purple">-</span>
      ) : (
        <span className="flex gap-1.5">
          {photos.slice(0, 4).map((p) => (
            <span key={p.id} className="flex w-[64px] flex-col items-center gap-0.5">
              <span
                className="h-[38px] w-[30px] flex-shrink-0 rounded-[5px] border border-line bg-cover bg-center"
                style={p.url ? { backgroundImage: `url(${p.url})` } : undefined}
              />
              <span
                className="w-full whitespace-normal break-all text-center font-mono text-[8.5px] leading-tight text-ink-soft"
                title={p.filename}
              >
                {p.filename}
              </span>
            </span>
          ))}
          {photos.length > 4 && <span className="self-center text-[10px] text-ink-soft">+{photos.length - 4}</span>}
        </span>
      )}
    </button>
  );
}

/**
 * Статус замовлення/оплати + сума + скільки внесено — жива зміна, без
 * окремого режиму редагування. Статус обирає адмін вручну, система сама
 * нічого не перемикає — лише показує залишок (amount - paid) довідково.
 */
function OrderCell({
  status,
  amount,
  paid,
  onChange,
}: {
  status: OrderStatus;
  amount: number | null;
  paid: number;
  onChange: (status: OrderStatus, amount: number | null, paid: number) => void;
}) {
  const [draftAmount, setDraftAmount] = useState(amount != null ? String(amount) : "");
  const [draftPaid, setDraftPaid] = useState(paid ? String(paid) : "");

  useEffect(() => {
    setDraftAmount(amount != null ? String(amount) : "");
  }, [amount]);
  useEffect(() => {
    setDraftPaid(paid ? String(paid) : "");
  }, [paid]);

  const remaining = amount != null ? amount - paid : null;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <select
          value={status}
          onChange={(e) => {
            const next = e.target.value as OrderStatus;
            if (next === "free") {
              onChange(next, 0, 0);
            } else {
              onChange(next, draftAmount ? Number(draftAmount) : amount, draftPaid ? Number(draftPaid) : paid);
            }
          }}
          className={`rounded-full border-none px-2 py-1 text-[11px] font-bold outline-none ${ORDER_STATUS_STYLE[status]}`}
        >
          {(Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).map((s) => (
            <option key={s} value={s}>
              {ORDER_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        {status !== "free" && (
          <>
            <input
              type="number"
              min={0}
              value={draftAmount}
              onChange={(e) => setDraftAmount(e.target.value)}
              onBlur={() => onChange(status, draftAmount ? Number(draftAmount) : null, draftPaid ? Number(draftPaid) : paid)}
              placeholder="Сума"
              title="Загальна сума"
              className="w-[64px] rounded-[7px] border border-line px-1.5 py-1 text-[11.5px] outline-none focus:border-purple"
            />
            <input
              type="number"
              min={0}
              value={draftPaid}
              onChange={(e) => setDraftPaid(e.target.value)}
              onBlur={() => onChange(status, draftAmount ? Number(draftAmount) : amount, draftPaid ? Number(draftPaid) : 0)}
              placeholder="Внесено"
              title="Скільки вже сплачено"
              className="w-[64px] rounded-[7px] border border-line px-1.5 py-1 text-[11.5px] outline-none focus:border-purple"
            />
          </>
        )}
      </div>
      {status === "free" && <span className="text-[10.5px] text-ink-soft">🎁 не враховується у фінансах</span>}
      {status !== "free" && remaining != null && remaining > 0 && (
        <span className="text-[10.5px] text-warn">Залишок: {remaining} ₴</span>
      )}
    </div>
  );
}

const ADD_STUDENT_CUSTOM_ROLE = "__custom__";

/** Рядок-форма додавання учня внизу таблиці — як новий рядок в Excel. */
function AddStudentRow({ colSpan, onAdd }: { colSpan: number; onAdd: (firstName: string, lastName: string, staffRole: string | null) => Promise<string | null> }) {
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [roleChoice, setRoleChoice] = useState(""); // "" | preset | ADD_STUDENT_CUSTOM_ROLE
  const [customRole, setCustomRole] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolvedRole = roleChoice === ADD_STUDENT_CUSTOM_ROLE ? customRole.trim() || null : roleChoice || null;

  async function handleAdd() {
    setSaving(true);
    setError(null);
    const err = await onAdd(firstName, lastName, resolvedRole);
    setSaving(false);
    if (err) {
      setError(err);
      return;
    }
    setFirstName("");
    setLastName("");
    setRoleChoice("");
    setCustomRole("");
  }

  return (
    <tr className="border-b border-line bg-page/60">
      <td className="py-2 pr-2 text-ink-soft">+</td>
      <td className="pr-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Прізвище"
            className="w-[110px] rounded-[7px] border border-line px-2 py-1 text-[12px] outline-none focus:border-purple"
          />
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Ім'я"
            className="w-[90px] rounded-[7px] border border-line px-2 py-1 text-[12px] outline-none focus:border-purple"
          />
          <select
            value={roleChoice}
            onChange={(e) => setRoleChoice(e.target.value)}
            className="rounded-[7px] border border-line px-1.5 py-1 text-[11px] outline-none focus:border-purple"
          >
            <option value="">— Учень —</option>
            {STAFF_ROLE_PRESETS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
            <option value={ADD_STUDENT_CUSTOM_ROLE}>Додати своє…</option>
          </select>
          {roleChoice === ADD_STUDENT_CUSTOM_ROLE && (
            <input
              value={customRole}
              onChange={(e) => setCustomRole(e.target.value)}
              placeholder="Напр. Завуч"
              className="w-[110px] rounded-[7px] border border-line px-2 py-1 text-[12px] outline-none focus:border-purple"
            />
          )}
          <button
            onClick={handleAdd}
            disabled={!firstName.trim() || !lastName.trim() || saving}
            className="rounded-[7px] bg-purple px-2.5 py-1 text-[11px] font-bold text-white disabled:opacity-50"
          >
            {saving ? "…" : "Додати"}
          </button>
          {error && <span className="text-[11px] font-semibold text-warn">{error}</span>}
        </div>
      </td>
      <td colSpan={colSpan}></td>
    </tr>
  );
}

export function CrmGrid({ classId }: { classId: string }) {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [students, setStudents] = useState<Student[] | null>(null);
  const [pickerFor, setPickerFor] = useState<{ studentId: string; slot: Slot } | null>(null);

  function refetch() {
    return fetch(`/api/classes/${classId}/crm`)
      .then((r) => r.json())
      .then((data) => {
        setSlots(data.slots ?? []);
        setStudents(data.students ?? []);
      });
  }

  useEffect(() => {
    refetch();
  }, [classId]);

  async function saveAnswer(studentId: string, slotId: string, answer: string) {
    await fetch(`/api/students/${studentId}/slots/${slotId}/answer`, {
      method: "PUT",
      body: JSON.stringify({ answer }),
    });
    setStudents((prev) =>
      (prev ?? []).map((s) => (s.id === studentId ? { ...s, values: { ...s.values, [slotId]: { kind: "text", answer } } } : s))
    );
  }

  async function saveOrder(studentId: string, status: OrderStatus, amount: number | null, paid: number) {
    setStudents((prev) =>
      (prev ?? []).map((s) => (s.id === studentId ? { ...s, order_status: status, order_amount: amount, paid_amount: paid } : s))
    );
    const res = await fetch(`/api/students/${studentId}/order`, {
      method: "PUT",
      body: JSON.stringify({ status, amount, paidAmount: paid }),
    });
    const data = await res.json().catch(() => null);
    // Сервер міг сам підставити дефолтну суму (з ціни типу альбому) — синхронізуємось.
    if (data) await refetch();
  }

  async function savePhotos(studentId: string, slot: Slot, photoIds: string[]) {
    await fetch(`/api/students/${studentId}/slots/${slot.id}/photos`, {
      method: "PUT",
      body: JSON.stringify({ photoIds }),
    });
    setPickerFor(null);
    // Найпростіше й найнадійніше — перезапитати грід, щоб отримати свіжі
    // filename/signed url обраних фото без дублювання логіки маппінгу тут.
    await refetch();
  }

  async function handleAddStudent(firstName: string, lastName: string, staffRole: string | null) {
    const res = await fetch(`/api/classes/${classId}/students`, {
      method: "POST",
      body: JSON.stringify({ firstName, lastName, staffRole }),
    });
    const data = await res.json();
    if (!res.ok) return data.error ?? "Не вдалося додати учня";
    await refetch();
    return null;
  }

  async function handleDeleteStudent(studentId: string, name: string) {
    if (!confirm(`Видалити "${name}" із класу? Усі його фото-слоти й відповіді теж зникнуть.`)) return;
    await fetch(`/api/students/${studentId}`, { method: "DELETE" });
    await refetch();
  }

  const progressByStudent = useMemo(() => {
    if (!slots || !students) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const s of students) {
      const done = slots.filter((slot) => isFilled(s.values[slot.id])).length;
      map.set(s.id, done);
    }
    return map;
  }, [slots, students]);

  if (slots === null || students === null) {
    return <p className="text-sm text-ink-soft">Завантажуємо…</p>;
  }

  if (slots.length === 0) {
    return (
      <p className="text-sm text-ink-soft">
        У типу альбому цього класу ще немає жодного слоту — додай на «Типи альбомів» → обраний
        тип → «Слоти CRM».
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-max border-collapse text-[13px]">
        <thead>
          <tr className="border-b-[1.5px] border-line text-left text-[11px] font-bold text-ink-soft">
            <th className="py-2.5 pr-3">#</th>
            <th className="whitespace-nowrap pr-5">Прізвище та ім'я</th>
            <th className="whitespace-nowrap pr-5">Прогрес</th>
            <th className="whitespace-nowrap pr-5">Замовлення</th>
            {slots.map((slot) => (
              <th key={slot.id} className="whitespace-nowrap px-3">
                {slot.kind === "photo" ? "📷" : "📝"} {slot.label}
              </th>
            ))}
            <th className="px-3"></th>
          </tr>
        </thead>
        <tbody>
          {students.map((student, i) => (
            <tr key={student.id} className="border-b border-line align-middle">
              <td className="py-3 pr-3 text-ink-soft">{i + 1}</td>
              <td className="whitespace-nowrap pr-5 font-semibold">
                {student.last_name} {student.first_name}
                {student.staff_role && (
                  <span className="ml-1.5 rounded-full bg-line px-1.5 py-0.5 text-[9.5px] font-bold text-ink-soft">
                    {student.staff_role}
                  </span>
                )}
              </td>
              <td className="whitespace-nowrap pr-5">
                <ProgressBar done={progressByStudent.get(student.id) ?? 0} total={slots.length} />
                {student.selection_confirmed_at && (
                  <span
                    className="mt-1 inline-block rounded-full bg-[#E7F7EE] px-1.5 py-0.5 text-[9.5px] font-bold text-ok"
                    title={`Учень підтвердив відбір ${new Date(student.selection_confirmed_at).toLocaleString("uk-UA")}`}
                  >
                    ✓ Підтвердив
                  </span>
                )}
              </td>
              <td className="whitespace-nowrap pr-5">
                <OrderCell
                  status={student.order_status}
                  amount={student.order_amount}
                  paid={student.paid_amount}
                  onChange={(status, amount, paid) => saveOrder(student.id, status, amount, paid)}
                />
              </td>
              {slots.map((slot) => {
                const value = student.values[slot.id];
                return (
                  <td key={slot.id} className={`px-3 py-3 ${slot.kind === "photo" ? "whitespace-nowrap" : ""}`}>
                    {slot.kind === "photo" ? (
                      <PhotoCell
                        photos={value?.kind === "photo" ? value.photos : []}
                        onEdit={() => setPickerFor({ studentId: student.id, slot })}
                      />
                    ) : (
                      <TextCell
                        value={value?.kind === "text" ? value.answer : ""}
                        filledByStudent={slot.filled_by === "student"}
                        onSave={(next) => saveAnswer(student.id, slot.id, next)}
                      />
                    )}
                  </td>
                );
              })}
              <td className="px-3">
                <button
                  onClick={() => handleDeleteStudent(student.id, `${student.last_name} ${student.first_name}`)}
                  aria-label="Видалити учня"
                  className="text-[12px] text-ink-soft hover:text-warn"
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
          <AddStudentRow colSpan={slots.length + 2} onAdd={handleAddStudent} />
        </tbody>
      </table>

      {students.length === 0 && <p className="mt-4 text-sm text-ink-soft">У класі ще немає учнів — додай нижче.</p>}

      {pickerFor && (
        <PhotoPicker
          classId={classId}
          studentId={pickerFor.studentId}
          slotLabel={pickerFor.slot.label}
          maxPhotos={pickerFor.slot.max_photos}
          initialPhotoIds={
            ((students.find((s) => s.id === pickerFor.studentId)?.values[pickerFor.slot.id] as PhotoValue | undefined)
              ?.photos ?? []).map((p) => p.id)
          }
          onSave={(photoIds) => savePhotos(pickerFor.studentId, pickerFor.slot, photoIds)}
          onClose={() => setPickerFor(null)}
        />
      )}
    </div>
  );
}
