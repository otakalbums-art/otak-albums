import { Card } from "@otak/ui";
import { LogoutButton } from "../logout-button";

/**
 * Показується, якщо роль адміна не має доступу НІ до однієї вкладки
 * (admin_roles.tab_keys порожній) — middleware.ts навмисно виключає цей
 * шлях із перевірки (pathToTab повертає null), щоб не було циклу
 * редіректів "нема доступу нікуди -> редірект на нема доступу нікуди".
 */
export default function NoAccessPage() {
  return (
    <div className="mx-auto max-w-[420px]">
      <Card title={null} menu={false}>
        <h1 className="mb-2 text-lg font-bold">Немає доступу</h1>
        <p className="mb-4 text-sm text-ink-soft">
          Вашій ролі поки не призначено доступ до жодної вкладки адмін-панелі.
          Зверніться до власника акаунту, щоб він додав потрібні розділи у
          «Користувачі та ролі».
        </p>
        <LogoutButton />
      </Card>
    </div>
  );
}
