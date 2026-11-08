# Спецификация

- `lib/reviewLinks.ts` (R4, R6): ключи `AppSetting` `reviews.2gis`, `reviews.yandex`;
  `normalizeReviewUrl(kind, input)`; `loadReviewLinks()`, `parseReviewLinksUpdate()`,
  `saveReviewLinks()`; `completionFollowUp({ links, inviteUrl, reviewUrl })` → строки текста.
- `GET/PUT /api/admin/settings/reviews` (R6): только `isAdminRequest()`, `Cache-Control: no-store`.
- `/admin` → карточка «Отзывы о площадке» с формой `ReviewLinksForm` (R6).
- `PATCH /api/bookings/[id]` (R1, R2, R7, R9): если исполнитель перевёл ACTIVE → COMPLETED, к событию
  `booking.status` добавляется `followUp: string[]` и к письму — те же строки. «Один раз» держит
  переход: `updateMany where status = ACTIVE` срабатывает один раз, из COMPLETED перехода нет.
  Чтение настроек/кода в try/catch → без строк.
- `renderNotification` (R1, R7): `followUp` дописывается к тексту только для `audience: customer`
  и статуса COMPLETED; путь — `/dashboard#bookings` (там форма отзыва, R3).
- Доставка — существующий `notifyUser` по выбранным каналам (R8).
- Тексты: «Спасибо, что заказали через ИИСтройка24!», «Оцените исполнителя: …»,
  «Оставьте отзыв о площадке: 2ГИС — …, Яндекс Карты — …», «Пригласите коллегу — нужна техника? …».
