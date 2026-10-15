/**
 * Куда в приложении ведёт кнопка «Следующего шага» (GET /api/guide). Сервер
 * отдаёт маршруты старой раскладки вкладок: брони исполнителя были во
 * вкладке «Техника», брони заказчика — в отдельной вкладке. Теперь брони
 * исполнителя живут в «Моих заказах», заказчика — в «Заказах» → «Брони».
 */
export function guideAppRoute(link: { href: string; app?: string } | undefined): string | null {
  const app = link?.app;
  if (!app) return null;
  if (app === '/(tabs)/provider' && link.href.includes('#bookings')) return '/(tabs)/jobs';
  if (app === '/(tabs)/bookings') return '/(tabs)/orders?view=bookings';
  return app;
}
