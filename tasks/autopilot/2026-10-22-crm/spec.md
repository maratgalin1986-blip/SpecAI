# Спецификация

## Схема (R10)
`packages/database/prisma/schema.prisma`, model Lead: `note String?`, `callAt DateTime?`,
`city String?`; `@@index([callAt])`. Выкладка через `prisma db push` — только добавление
nullable-колонок.

## API (R1–R3, R9)
`PATCH /api/admin/leads/[id]` — расширить updateSchema: `note: string ≤ 2000 | null`,
`callAt: ISO-строка | null`, `city: string ≤ 80 | null`; всё partial. Если в запросе
`callAt` не null — в data добавляется `status: 'IN_PROGRESS'`, когда текущий статус NEW
(читаем заявку перед обновлением). Ответ `{ lead }`.

## Чистые функции (R4–R7, R11) — `apps/web/src/lib/adminCrm.ts`
- `parseCrmQuery(searchParams)` → `{ status: LeadFilter, today: boolean, city: string, from?: Date, to?: Date }`; даты — `YYYY-MM-DD` по Москве.
- `mskDayBounds(now)` → начало/конец суток по Europe/Moscow.
- `filterCrm(leads, query, now)` — последовательное применение фильтров.
- `sortCrm(leads, now)` — просроченные callAt → новые → перезвонить сегодня → остальные в работе → обработанные; внутри — новее первыми.
- `crmCounters(leads, now)` → `{ new, today, overdue }`.
- `callbackReminderText(leads, now)` → текст для Telegram: «📞 Перезвонить завтра (N)» и «⚠️ Просрочено (M)», строки «Имя · +7… · город — заметка (первые 80 знаков)», ≤ 30 строк, `null`, если пусто.

## Страница `/admin/leads` (R4–R6, R8)
Серверный компонент `apps/web/src/app/admin/leads/page.tsx`: `prisma.lead.findMany({ where: { NOT: { phone: '' } }, orderBy: { createdAt: 'desc' }, take: 500 })`, затем фильтры и сортировка в памяти (как на /admin). Форма фильтров (GET): чипы статуса, чекбокс «Перезвонить сегодня», поле «Город», даты «с» / «по», кнопка «Показать». Счётчики — три плашки. Карточка заявки: существующие `PhoneLink`, `LeadStatusSelect`, `LeadOutcome` + новый клиентский `LeadCrmFields` (город, перезвонить `datetime-local`, заметка `textarea`, кнопка «Сохранить», сохранение по blur/кнопке, индикатор «Сохранено»/«Ошибка»). Просроченная — красная рамка, сегодня — янтарная.
`AdminNav`: «Звонки» → `/admin/leads`. На `/admin` в заголовке блока заявок — ссылка «Открыть CRM».

## Напоминание (R7)
В `api/cron/daily` после документов: `prisma.lead.findMany({ where: { callAt: { lte: endOfTomorrowMsk }, status: { not: 'DONE' } } })` → `callbackReminderText` → `notifyTelegram`, обёрнуто в `onceADay('lead-callbacks')`, ошибки логируются и не ломают остальной крон. Ответ крона получает `callbacks: { due, sent }`.

## Тексты
Все по-русски: «Заметка», «Перезвонить», «Город», «Перезвонить сегодня», «Просрочено», «Открыть CRM», «Сохранено», «Не сохранилось — попробуйте ещё раз».
