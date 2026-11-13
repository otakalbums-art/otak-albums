"use client";

import { useEffect, useMemo, useState } from "react";
import { PhotoPicker } from "./photo-picker";
import { DualScroll } from "@otak/ui";
import { Camera, Check, Clock, FileText, Gift, Link2, Plus, ShoppingBag, X } from "lucide-react";
import { createSupabaseBrowserClient } from "@otak/supabase/browser";
import { classChannel, groupForTime, type Question, type TimeGroup } from "@otak/supabase/cabinet";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

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
  access_token: string;
  shoot_time: string | null;
  deposit_amount: number | null;
  extra_payment_amount: number | null;
  answers: Record<string, string>;
  options: { optionId: string; name: string; quantity: number }[];
  values: Record<string, PhotoValue | TextValue>;
};

type CatalogOption = { id: string; category: string | null; name: string; price: number | null };

/** Напівпрозора заливка кольором групи — текст лишається читабельним. */
function tint(hex: string, alpha = "40") {
  return `${hex}${alpha}`;
}

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
  onChange: (status: OrderStatus, amount: number | null) => void;
}) {
  const [draftAmount, setDraftAmount] = useState(amount != null ? String(amount) : "");

  useEffect(() => {
    setDraftAmount(amount != null ? String(amount) : "");
  }, [amount]);

  const remaining = amount != null ? amount - paid : null;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <select
          value={status}
          onChange={(e) => {
            const next = e.target.value as OrderStatus;
            onChange(next, next === "free" ? 0 : draftAmount ? Number(draftAmount) : amount);
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
              onBlur={() => onChange(status, draftAmount ? Number(draftAmount) : null)}
              placeholder="Сума"
              title="Загальна сума"
              className="w-[64px] rounded-[7px] border border-line px-1.5 py-1 text-[11.5px] outline-none focus:border-purple"
            />
            <span className="whitespace-nowrap text-[10.5px] text-ink-soft" title="Завдаток + доплата">
              внесено {paid} ₴
            </span>
          </>
        )}
      </div>
      {status === "free" && <span className="inline-flex items-center gap-1 text-[10.5px] text-ink-soft">
          <Gift className="h-3 w-3" /> не враховується у фінансах
        </span>}
      {status !== "free" && remaining != null && remaining > 0 && (
        <span className="text-[10.5px] text-warn">Залишок: {remaining} ₴</span>
      )}
    </div>
  );
}

/** Сума, що зберігається при виході з поля (завдаток / доплата). */
function MoneyCell({ value, onSave }: { value: number | null; onSave: (next: number | null) => void }) {
  const [draft, setDraft] = useState(value != null ? String(value) : "");
  useEffect(() => {
    setDraft(value != null ? String(value) : "");
  }, [value]);
  return (
    <input
      type="number"
      min={0}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const next = draft === "" ? null : Number(draft);
        if (next !== value) onSave(next);
      }}
      placeholder="-"
      className="w-[72px] rounded-[7px] border border-line px-1.5 py-1 text-[12px] outline-none focus:border-purple"
    />
  );
}

/** Час зйомки — адмін може поставити будь-який; помилка, якщо він зайнятий іншою дитиною. */
function TimeCell({
  value,
  group,
  onSave,
}: {
  value: string | null;
  group: TimeGroup | null;
  onSave: (next: string | null) => Promise<string | null>;
}) {
  const [draft, setDraft] = useState(value ?? "");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);
  return (
    <div className="flex flex-col gap-0.5">
      <input
        type="time"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={async () => {
          if ((draft || null) === value) return;
          const err = await onSave(draft || null);
          setError(err);
          if (err) setDraft(value ?? "");
        }}
        className="w-[92px] rounded-[7px] border border-line bg-white/80 px-1.5 py-1 text-[12px] outline-none focus:border-purple"
      />
      {group && (
        <span className="max-w-[92px] truncate text-[9.5px] font-bold text-ink">
          {group.name}
        </span>
      )}
      {error && <span className="max-w-[140px] text-[10px] font-semibold leading-tight text-warn">{error}</span>}
    </div>
  );
}

/** Копіює персональне посилання кабінету дитини. */
function PersonalLinkButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(`${SITE_URL}/k/${token}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      title="Скопіювати персональне посилання для батьків"
      className="ml-1.5 inline-flex items-center gap-0.5 rounded-full border border-line bg-page px-1.5 py-0.5 text-[10px] font-semibold text-purple hover:border-purple"
    >
      {copied ? <Check className="h-3 w-3" /> : <Link2 className="h-3 w-3" />}
      {copied ? "Скопійовано" : "Посилання"}
    </button>
  );
}

/** Додаткові послуги дитини: чипи «Назва ×N» + додавання з каталогу. */
function OptionsCell({
  value,
  catalog,
  onSet,
}: {
  value: { optionId: string; name: string; quantity: number }[];
  catalog: CatalogOption[];
  onSet: (optionId: string, quantity: number) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [optionId, setOptionId] = useState("");
  const [qty, setQty] = useState("1");
  const [busy, setBusy] = useState(false);

  async function set(id: string, quantity: number) {
    setBusy(true);
    await onSet(id, quantity);
    setBusy(false);
  }

  return (
    <div className="flex min-w-[150px] max-w-[260px] flex-wrap items-center gap-1">
      {value.map((o) => (
        <span
          key={o.optionId}
          className="inline-flex items-center gap-1 rounded-full bg-[#FFF4D6] py-0.5 pl-2 pr-1 text-[11px] font-semibold text-[#8A6D00]"
        >
          {o.name}
          <select
            value={o.quantity}
            disabled={busy}
            onChange={(e) => set(o.optionId, Number(e.target.value))}
            className="rounded bg-transparent text-[11px] font-bold outline-none"
            title="Кількість"
          >
            {Array.from({ length: Math.max(10, o.quantity) }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                ×{n}
              </option>
            ))}
          </select>
          <button onClick={() => set(o.optionId, 0)} disabled={busy} aria-label="Прибрати послугу" className="hover:text-warn">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {adding ? (
        <span className="flex flex-wrap items-center gap-1">
          <select
            value={optionId}
            onChange={(e) => setOptionId(e.target.value)}
            className="max-w-[170px] rounded-[7px] border border-line px-1 py-1 text-[11px] outline-none focus:border-purple"
          >
            <option value="">Послуга…</option>
            {catalog
              .filter((c) => !value.some((v) => v.optionId === c.id))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.category ? `${c.category} · ` : ""}
                  {c.name}
                  {c.price != null ? ` — ${c.price} ₴` : ""}
                </option>
              ))}
          </select>
          <input
            type="number"
            min={1}
            max={100}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="w-[44px] rounded-[7px] border border-line px-1 py-1 text-[11px] outline-none focus:border-purple"
          />
          <button
            disabled={!optionId || busy || !(Number(qty) >= 1)}
            onClick={async () => {
              await set(optionId, Number(qty));
              setAdding(false);
              setOptionId("");
              setQty("1");
            }}
            className="rounded-[7px] bg-purple px-2 py-1 text-[11px] font-bold text-white disabled:opacity-50"
          >
            OK
          </button>
          <button onClick={() => setAdding(false)} aria-label="Скасувати" className="text-ink-soft hover:text-warn">
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      ) : catalog.length ? (
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-line px-1.5 py-0.5 text-[10.5px] font-semibold text-ink-soft hover:border-purple hover:text-purple"
        >
          <Plus className="h-3 w-3" /> послуга
        </button>
      ) : (
        <span className="text-[10.5px] text-ink-soft">Каталог порожній</span>
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
      <td className="pr-3" colSpan={2}>
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
  const [questions, setQuestions] = useState<Question[]>([]);
  const [timeGroups, setTimeGroups] = useState<TimeGroup[]>([]);
  const [optionCatalog, setOptionCatalog] = useState<CatalogOption[]>([]);
  const [pickerFor, setPickerFor] = useState<{ studentId: string; slot: Slot } | null>(null);

  function refetch() {
    return fetch(`/api/classes/${classId}/crm`)
      .then((r) => r.json())
      .then((data) => {
        setSlots(data.slots ?? []);
        setStudents(data.students ?? []);
        setQuestions(data.questions ?? []);
        setTimeGroups(data.timeGroups ?? []);
        setOptionCatalog(data.optionCatalog ?? []);
      });
  }

  useEffect(() => {
    refetch();
    // Зміни від батьків (кабінет) і інших адмінів — без перезавантаження сторінки.
    const supabase = createSupabaseBrowserClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel(classChannel(classId))
      .on("broadcast", { event: "changed" }, () => {
        clearTimeout(timer);
        timer = setTimeout(refetch, 300);
      })
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  async function saveOrder(studentId: string, status: OrderStatus, amount: number | null) {
    setStudents((prev) =>
      (prev ?? []).map((s) => (s.id === studentId ? { ...s, order_status: status, order_amount: amount } : s))
    );
    const res = await fetch(`/api/students/${studentId}/order`, {
      method: "PUT",
      body: JSON.stringify({ status, amount }),
    });
    const data = await res.json().catch(() => null);
    // Сервер міг сам підставити дефолтну суму (з ціни типу альбому) — синхронізуємось.
    if (data) await refetch();
  }

  async function saveQuestionAnswer(studentId: string, key: string, answer: string) {
    await fetch(`/api/students/${studentId}/answers`, { method: "PUT", body: JSON.stringify({ key, answer }) });
    setStudents((prev) =>
      (prev ?? []).map((s) => (s.id === studentId ? { ...s, answers: { ...s.answers, [key]: answer } } : s))
    );
  }

  /** Повертає текст помилки або null. */
  async function patchStudent(studentId: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/students/${studentId}`, { method: "PATCH", body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return (data.error as string) ?? "Не вдалося зберегти";
    await refetch();
    return null;
  }

  async function setStudentOption(studentId: string, optionId: string, quantity: number) {
    await fetch(`/api/students/${studentId}/options`, { method: "PUT", body: JSON.stringify({ optionId, quantity }) });
    await refetch();
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

  const hasSlots = slots.length > 0;
  // Колонки після імені: прогрес (лише зі слотами), замовлення, завдаток, доплата, слоти, анкета.
  const extraCols = (hasSlots ? 1 : 0) + 4 + slots.length + questions.length;

  return (
    <div>
      <DualScroll>
      <table className="min-w-max border-collapse text-[13px]">
        <thead>
          <tr className="border-b-[1.5px] border-line text-left text-[11px] font-bold text-ink-soft">
            <th className="py-2.5 pr-3">#</th>
            <th className="whitespace-nowrap pr-3">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> Час
              </span>
            </th>
            <th className="whitespace-nowrap pl-4 pr-5">Прізвище та ім'я</th>
            {hasSlots && <th className="whitespace-nowrap pr-5">Прогрес</th>}
            <th className="whitespace-nowrap pr-5">Замовлення</th>
            <th className="whitespace-nowrap pr-3">Завдаток</th>
            <th className="whitespace-nowrap pr-5">Доплата</th>
            <th className="whitespace-nowrap pr-5">
              <span className="inline-flex items-center gap-1">
                <ShoppingBag className="h-3.5 w-3.5" /> Додатково
              </span>
            </th>
            {slots.map((slot) => (
              <th key={slot.id} className="whitespace-nowrap px-3">
                <span className="inline-flex items-center gap-1">
                  {slot.kind === "photo" ? <Camera className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                  {slot.label}
                </span>
              </th>
            ))}
            {questions.map((q) => (
              <th key={q.key} className="whitespace-nowrap px-3">
                {q.label}
              </th>
            ))}
            <th className="px-3"></th>
          </tr>
        </thead>
        <tbody>
          {students.map((student, i) => (
            <tr key={student.id} className="border-b border-line align-middle">
              <td className="py-3 pr-3 text-ink-soft">{i + 1}</td>
              <td
                className="px-2 py-1.5"
                style={(() => {
                  const g = groupForTime(timeGroups, student.shoot_time);
                  return g ? { background: tint(g.color) } : undefined;
                })()}
              >
                <TimeCell
                  value={student.shoot_time}
                  group={groupForTime(timeGroups, student.shoot_time)}
                  onSave={(next) => patchStudent(student.id, { shootTime: next })} />
              </td>
              <td className="whitespace-nowrap pl-4 pr-5 font-semibold">
                {student.last_name} {student.first_name}
                {student.staff_role && (
                  <span className="ml-1.5 rounded-full bg-line px-1.5 py-0.5 text-[9.5px] font-bold text-ink-soft">
                    {student.staff_role}
                  </span>
                )}
                <PersonalLinkButton token={student.access_token} />
              </td>
              {hasSlots && (
              <td className="whitespace-nowrap pr-5">
                <ProgressBar done={progressByStudent.get(student.id) ?? 0} total={slots.length} />
                {student.selection_confirmed_at && (
                  <span
                    className="mt-1 inline-flex items-center gap-0.5 rounded-full bg-[#E7F7EE] px-1.5 py-0.5 text-[9.5px] font-bold text-ok"
                    title={`Учень підтвердив відбір ${new Date(student.selection_confirmed_at).toLocaleString("uk-UA")}`}
                  >
                    <Check className="h-2.5 w-2.5" /> Підтвердив
                  </span>
                )}
              </td>
              )}
              <td className="whitespace-nowrap pr-5">
                <OrderCell
                  status={student.order_status}
                  amount={student.order_amount}
                  paid={student.paid_amount}
                  onChange={(status, amount) => saveOrder(student.id, status, amount)}
                />
              </td>
              <td className="pr-3">
                <MoneyCell value={student.deposit_amount} onSave={(v) => patchStudent(student.id, { depositAmount: v })} />
              </td>
              <td className="pr-5">
                <MoneyCell
                  value={student.extra_payment_amount}
                  onSave={(v) => patchStudent(student.id, { extraPaymentAmount: v })}
                />
              </td>
              <td className="pr-5">
                <OptionsCell
                  value={student.options}
                  catalog={optionCatalog}
                  onSet={(optionId, quantity) => setStudentOption(student.id, optionId, quantity)}
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
              {questions.map((q) => (
                <td key={q.key} className="px-3 py-3">
                  <TextCell
                    value={student.answers[q.key] ?? ""}
                    filledByStudent={false}
                    onSave={(next) => saveQuestionAnswer(student.id, q.key, next)}
                  />
                </td>
              ))}
              <td className="px-3">
                <button
                  onClick={() => handleDeleteStudent(student.id, `${student.last_name} ${student.first_name}`)}
                  aria-label="Видалити учня"
                  className="text-[12px] text-ink-soft hover:text-warn"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </td>
            </tr>
          ))}
          <AddStudentRow colSpan={extraCols + 1} onAdd={handleAddStudent} />
        </tbody>
      </table>
      </DualScroll>

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
