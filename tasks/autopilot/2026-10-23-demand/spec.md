# Спецификация

## Схема (R11)

`NotificationSettings`: `demandNudge Boolean @default(true)`, `demandNudgeSentAt DateTime?` —
рядом с `priceAsk`, с комментарием.

## Чистая логика `apps/web/src/lib/demandNudge.ts` (R2–R5, R7, R9, R12)

- `mskDayStart(now): Date` — 00:00 по Москве (UTC+3, без переходов) текущих суток.
- `inDemandWindow(now): boolean` — 09:00 ≤ время МСК < 12:00 (от МСК−1 до МСК+9 — везде день по местному времени: Калининград 08–11, Камчатка 18–21).
- `demandNudgeDue(sentAt, now): boolean` — `sentAt` пуст или раньше `mskDayStart(now)`.
- `countNearbyOrders(provider: ProviderForMatch, orders: OrderForMatch[]): number` — через `providerMatchesOrder`.
- `demandNudgeText(n)` → `{ title: 'Сегодня N заявок рядом', body: 'Выйдите на линию — заказчики видят свободные машины на карте и пишут первым.' }` с правильным склонением (1 заявка, 2 заявки, 5 заявок, 21 заявка, 11 заявок).
- `DEMAND_NUDGE_PATH = '/orders'`.

## События (R7, R9)

`routing.ts`: событие `{ type: 'demand.today'; count: number }`, рендер через `demandNudgeText`,
`path: DEMAND_NUDGE_PATH`. Доставка только push и telegram (как это принято в `deliver.ts` для
ограниченных каналов — найти существующий механизм; если нет — опция `channels` в `deliver`).

## Данные `apps/web/src/lib/demandNudgeData.ts` (R1–R6, R10)

- `claimDemandNudge(userId, now)` — как `claimPriceAsk`: `updateMany` где `demandNudge: true` и
  (`demandNudgeSentAt` null или < `mskDayStart(now)`); строки нет — создать.
- `sendDemandNudges({ now, deadline, notify })`: вне окна — `{ skipped: 'window' }`. Заявки:
  OPEN, `createdAt ≥ mskDayStart`, до 500, с location и category → `OrderForMatch` (как в
  `matchOrderRecipients`: `orderPoint`, `acceptedCategoryIds`). Компании: `isProvider`, не
  `HOUSE_COMPANY_ID`, с техникой не RETIRED, их PROVIDER_ADMIN. Заявки своих руководителей и
  заявки, на которые компания уже сделала предложение, не считаются (как в `providerFeed.ts`).
  Компания, у которой сейчас есть машина на линии (`LinePresence` по `companyId`, `isOnLine`,
  `PRESENCE_FRESH_MS`; выводит и машинист), пропускается целиком. N ≥ 1 → claim → notify; доставка
  не удалась ни по одному каналу → отметка дня остаётся (иначе заблокированный бот получал бы
  попытку каждые 5 минут; решение ревью), завтра — снова. Остановка по
  `deadline`. Ответ — только числа.
- `demandNudgeEnabled(userId)`, `setDemandNudge(userId, enabled)` — для выключателя.

## Крон (R10)

`/api/cron/notices`: после `flushDeferredOrderNotices` — `sendDemandNudges` с дедлайном ~20 с;
его ошибка не ломает ответ отложенных уведомлений; в ответ добавить `demand: {...}`.

## Выключатель (R8)

- `GET/PATCH /api/account/demand-nudge` — как `/api/account/price-ask`: 401 без входа,
  `available: false` для не-исполнителей и парка СпецПласт16, 403 на PATCH для них, 400 на
  неверное тело. Тексты ошибок по-русски.
- Сайт: `components/DemandNudgeSetting.tsx` рядом с `PriceAskSetting` там же, где он выводится.
  Подпись: «Спрос рядом — раз в день, если сегодня рядом есть заявки на вашу технику».
- Приложение: `apps/mobile/src/components/DemandNudgeSetting.tsx` рядом с `PriceAskSetting`,
  API в `apps/mobile/src/lib/aktualno.ts` или новом `lib/demandNudge.ts`.
