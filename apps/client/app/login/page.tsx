import { Card } from "@otak/ui";

/**
 * Без реферального коду в URL увійти неможливо — раніше ця сторінка мала
 * форму, що завжди підставляла захардкожений код одного тестового класу
 * (тому працювала лише для нього). Реальний вхід — тільки за персональним
 * посиланням класу, apps/client/app/login/[referralCode]/page.tsx.
 */
export default function LoginPage() {
  return (
    <div className="mx-auto max-w-[420px]">
      <Card title={null} menu={false}>
        <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-soft">Вхід за інвайтом</div>
        <h1 className="mb-1.5 text-2xl font-bold">Потрібне персональне посилання</h1>
        <p className="text-[13.5px] text-ink-soft">
          Щоб зайти в галерею класу, скористайся посиланням-запрошенням, яке надіслав фотограф або
          відповідальна особа класу — воно виглядає як <code className="font-mono text-purple">/login/…</code>.
          Пряме введення прізвища тут без нього неможливе, бо система ще не знає, до якого класу
          тебе перевіряти.
        </p>
      </Card>
    </div>
  );
}
