import { Card } from "@otak/ui";

/**
 * Стан "віртуального бекап-сервера". Це інфраструктурне питання, не таблиця в БД:
 * дивись docs/backup-strategy.md для варіантів реалізації (реплікація Supabase
 * Storage у другий бакет/провайдер + health-check + автоперемикання на рівні
 * Next.js middleware або CDN).
 */
export default function BackupPage() {
  return (
    <div>
      <h3 className="mb-3 text-[15.5px] font-bold">Стан серверів</h3>
      <div className="flex flex-wrap gap-3.5">
        <div className="min-w-[210px] flex-1 rounded-xl border border-line bg-card p-4">
          <div className="flex items-center gap-1.5 font-bold">
            <span className="h-2 w-2 rounded-full bg-ok" /> Основний сервер
          </div>
          <p className="mt-1.5 text-xs text-ink-soft">
            Онлайн · затримка 42 мс · останній бекап 3 хв тому
          </p>
        </div>
        <div className="min-w-[210px] flex-1 rounded-xl border border-line bg-card p-4">
          <div className="flex items-center gap-1.5 font-bold">
            <span className="h-2 w-2 rounded-full bg-purple-soft" /> Резервний сервер
          </div>
          <p className="mt-1.5 text-xs text-ink-soft">
            У режимі очікування · синхронізовано на 100% · готовий до автоперемикання
          </p>
        </div>
      </div>
      <Card title="Логіка перемикання" menu={false} className="mt-3.5">
        <p className="text-xs text-ink-soft">
          Якщо основний сервер втрачає з'єднання довше 30 секунд, платформа автоматично
          перенаправляє завантаження та перегляд на резервний сервер. Після відновлення
          основного — дані синхронізуються назад без переривання роботи фотографа чи учнів.
        </p>
      </Card>
    </div>
  );
}
