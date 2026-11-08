# Приёмка

| R   | Итог      | Доказательство                                                                                                                                            |
| --- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | выполнено | `app/api/bookings/[id]/route.test.ts` «the customer hears once…»; `lib/notifications/routing.test.ts` «adds the follow-up lines only to «завершена»»      |
| R2  | выполнено | тот же файл, «a second click finds the status changed and sends nothing» (переход ACTIVE → COMPLETED под `updateMany where status`)                       |
| R3  | выполнено | строка «Оцените исполнителя …», ссылка сообщения ведёт на `/dashboard#bookings` (форма `ReviewForm` у выполненной брони)                                  |
| R4  | выполнено | `lib/reviewLinks.test.ts` — https, только 2gis.ru/2gis.com и yandex.ru/yandex.com `/maps`, подделки отклоняются; строка карт только с введёнными ссылками |
| R5  | выполнено | `completionFollowUp` + тест «leaves out … the invitation without a code»; личная ссылка `/r/<код>` через `ensureReferralCode`                             |
| R6  | выполнено | `app/api/admin/settings/reviews/route.test.ts` — 401 без админа; форма «Отзывы о площадке» в `/admin#reviews`                                             |
| R7  | выполнено | тесты «other moves carry no follow-up», исполнителю строки не уходят (routing.test)                                                                       |
| R8  | выполнено | доставка через `notifyUser` по выбранным каналам; push — одна строка, SMS — короткая (deliver.test)                                                       |
| R9  | выполнено | тест «a failure to read the links or the code keeps the status change and the thanks»                                                                     |

Ревью (`/code-review`, средняя глубина): push с длинными ссылками, слишком широкая проверка Яндекса,
дубль ссылки в Telegram, некликабельные ссылки в письме, немое проглатывание ошибок — исправлено
с тестами. Не исправлено осознанно: SMS остаётся одной строкой (цена SMS); база ссылок — `siteUrl()`,
как у остальных уведомлений; форма админа повторяет форму донатов (перезагрузка при ошибке).

PLACEHOLDER: ссылки на карточки 2ГИС и Яндекс Карт — вводит владелец в /admin → «Отзывы о площадке».
