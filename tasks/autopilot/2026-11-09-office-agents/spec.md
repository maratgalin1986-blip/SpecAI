# Спецификация: офис из двух агентов

Ссылки на требования — `requirements.md` (R1…R20).

## 0. Общие решения

- Код агентов живёт в `apps/web/src/lib/office/**` (чистые функции с тестами) и маршрутах
  `apps/web/src/app/{admin/office,api/admin/office,api/cron/office,preview,s,p}/**`. Никаких
  обращений к ИИ на проде: страницы и скрипты строятся по словарям и шаблонам (владелец, 2026-10-18).
- Два агента — одна механика, разные словари и шаблоны: `AgentId = 'sites' | 'providers'`
  (`lib/office/agents.ts`: имя, описание, ниши по умолчанию, шаблоны).
- Тексты по-русски, без «кабинет/вкладка/сайт/приложение» в ошибках (REVIEW § 5). Платформа —
  `SITE.platform`.
- Даты «сегодня» — по Москве (`moscowDateKey` из `lib/bookingRules.ts`, `mskDate` из `lib/adminCrm.ts`).

## 1. Схема (R20) — `packages/database/prisma/schema.prisma`, только новые модели

```prisma
// Офис агентов (tasks/autopilot/2026-11-09-office-agents): кандидаты двух агентов —
// «Сайты под ключ» (kind "site") и «Подрядчики» (kind "provider"). Строки, не enum
// (CLAUDE.md, правило 2). status: NEW → READY → CALLBACK | AGREED → PUBLISHED | DECLINED;
// REGISTERED — подрядчик зарегистрировался по ссылке со своей страницы.
model Prospect {
  id          String    @id @default(cuid())
  kind        String                       // "site" | "provider"
  status      String    @default("NEW")
  slug        String    @unique            // адрес опубликованной страницы
  token       String    @unique            // секрет превью
  name        String
  phone       String
  address     String?
  city        String?
  lat         Float?
  lon         Float?
  niche       String                       // ключ ниши из lib/office/niches.ts
  tags        String?                      // виды техники / услуги через запятую (из карточки)
  hours       String?
  source      String    @default("osm")    // "osm" | "manual"
  sourceRef   String?                      // id объекта источника ("osm:node/123")
  note        String?
  callAt      DateTime?
  calledAt    DateTime?
  agreedAt    DateTime?
  publishedAt DateTime?
  declinedAt  DateTime?
  registeredAt DateTime?
  runId       String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([status])
  @@index([kind, city])
  @@index([phone])
  @@index([sourceRef])
}

// Журнал прогонов офиса (R4).
model OfficeRun {
  id         String    @id @default(cuid())
  agent      String                        // "sites" | "providers"
  niche      String
  city       String
  trigger    String    @default("cron")    // "cron" | "admin" | "telegram"
  found      Int       @default(0)
  created    Int       @default(0)
  skipped    Int       @default(0)
  error      String?
  startedAt  DateTime  @default(now())
  finishedAt DateTime?

  @@index([startedAt])
}
```

Настройки — в `AppSetting` (существует): `office.plan` (строки плана), `office.cursor` (номер
следующего шага), `office.sitePrice`, `office.siteMonthly`, `office.paused` ("1" — офис на паузе).

## 2. Ниши и агенты — `lib/office/niches.ts`, `lib/office/agents.ts` (R2, R5, R9, R10)

- `NICHES: Record<NicheKey, Niche>`: `{ key, title (ед. ч., «Стоматология»), agent, osm: {tags:
  [['amenity','dentist'], ...], nameRegex?: RegExp}, services: string[] (5–8 услуг для страницы),
  heroLine: string («Лечение зубов без боли в …» — шаблон с {city}), accent: 'teal'|'amber'|… }`.
  Ниши агента «Сайты»: `dentist` (amenity=dentist|healthcare=dentist), `car_repair`
  (shop=car_repair), `tyres` (shop=tyres), `beauty` (shop=beauty|shop=hairdresser), `vet`
  (amenity=veterinary). Ниша агента «Подрядчики»: `machinery` — объекты с тегами
  `shop=rental`/`office=company`/`industrial=*`/`craft=*`/`shop=car`… **и** названием по регулярке
  `/спецтехник|аренда (техники|экскаватор|автокран|манипулятор)|экскават|автокран|манипулятор|
  самосвал|эвакуатор|погрузчик|автовышк|бульдозер|ямобур|бетононасос/i`; виды техники для `tags`
  — по совпадениям той же регулярки с `packages/shared/src/categories.ts` (slug вида).
- `AGENTS: Record<AgentId, {id, name ('Сайты под ключ' | 'Подрядчики'), kind: 'site'|'provider',
  description, defaultNiches}>`.
- План по умолчанию (`lib/office/plan.ts`): `defaultPlan()` → строки `providers; machinery; <город>`
  для первых 30 городов `RUSSIAN_CITIES` (shared) и `sites; <ниша>; <город>` для ниш P2 × городов
  [Набережные Челны, Казань, Нижнекамск, Альметьевск, Уфа, Самара, Пермь, Екатеринбург] —
  чередуя агентов (providers, sites, providers, …). `parsePlan(text)` → `PlanStep[]` (строка
  «агент; ниша; город», неизвестные агент/ниша/город — пропускаются с ошибкой в списке);
  `nextStep(plan, cursor)` по кругу. Город сверяется с `cityByName` из shared (координаты оттуда).

## 3. Поиск — `lib/office/sources/osm.ts`, `lib/office/sources/manual.ts`, `lib/office/sources/types.ts` (R5–R8)

- `interface ProspectSource { id: string; search(input: {niche: Niche; city: RussianCity;
  radiusKm: number; limit: number}): Promise<Candidate[]> }`;
  `Candidate = { name, phone, address?, lat?, lon?, hours?, website?: string|null, tags?: string[],
  sourceRef }`.
- OSM: `buildOverpassQuery(niche, city, radiusKm)` (чистая) — `[out:json][timeout:25]; (
  nwr[amenity=dentist](around:R,lat,lon); …); out center tags;` ; `parseOverpass(json, niche)`
  (чистая) — оставляет объекты с `name` и телефоном (`phone`|`contact:phone`), нормализует телефон
  через `extractPhone` из shared (приводит к `+7…`), собирает адрес из `addr:street`, `addr:housenumber`,
  `addr:city`; `website = tags.website ?? tags['contact:website'] ?? tags.url ?? null`;
  `withoutWebsite(list)` — фильтр; `hours = opening_hours`. Для ниши `machinery` — дополнительно фильтр
  по `nameRegex` и `tags` = совпавшие виды техники. `fetchOverpass(query)` — POST на
  `https://overpass-api.de/api/interpreter` с `User-Agent: GEO_USER_AGENT` (из `lib/geo.ts`),
  таймаут 25 с, при ошибке — `{ status: 'unavailable' }`, шаг прогона пишет `error`.
  Радиус: 15 км (крупный город), лимит кандидатов на шаг — 10 (`STEP_LIMIT`).
- Manual: `parseManualLines(text)` — строки «Название; телефон; адрес или город», телефон через
  `extractPhone`, город — `findCityInText` из shared; без телефона — ошибка строки; `sourceRef =
  'manual:<нормализованный телефон>'`.

## 4. Прогон шага — `lib/office/run.ts` (R1, R4, R6)

`runStep({agent, niche, city, trigger, source?})`:

1. создаёт `OfficeRun`;
2. `source.search(...)` (по умолчанию OSM);
3. отбрасывает кандидатов с сайтом; дедуп: `Prospect` с тем же `sourceRef` или тем же `phone`
   (любой статус) → `skipped`; для агента `providers` — ещё `Company.phone` с тем же номером на
   площадке (нормализованное сравнение по последним 10 цифрам: `phone: { endsWith: last10 }`) → `skipped`;
4. создаёт `Prospect` статусом `READY` (страница строится на лету из данных, хранить HTML не нужно):
   `slug = slugify(name)-<city>-<4 символа>` (транслит через существующий `lib/translit.ts`, если
   есть, иначе своя простая таблица), `token = crypto.randomBytes(16).toString('hex')`;
5. закрывает `OfficeRun` (`found`, `created`, `skipped`, `finishedAt`, `error`).

`runScheduledStep(now)` — читает `office.paused`, `office.plan`/`office.cursor`, берёт `nextStep`,
двигает курсор (в транзакции с upsert `AppSetting`), вызывает `runStep` с `trigger: 'cron'`.
Рабочее окно шага — любое время (ночью тоже), но не чаще одного шага в час (вызов из workflow).

## 5. Страницы — `lib/office/pages.ts`, компоненты, маршруты (R9–R13)

- `buildSitePage(p: ProspectView): SitePage` — `{ title: name, eyebrow: niche.title, hero:
  niche.heroLine с городом, services: niche.services, address, hours, phone, whatsapp:
  'https://wa.me/<цифры>', mapHref: 'https://yandex.ru/maps/?pt=lon,lat&z=16' (если есть
  координаты, иначе поиск по адресу), accent }`. Никаких отзывов/цен/фото/цифр (R9).
- `buildProviderPage(p): ProviderPage` — `{ title: name, city, machines: tags → названия видов из
  categories.ts (пусто → ['Спецтехника']), orderHref: '/orders?city=<город>' (+ `&category=<slug>`
  при одном виде), joinHref: '/register?role=provider&name=&phone=&city=&prospect=<slug>',
  phone (только когда published) }`.
- `buildCallScript(p, prices): string[]` (абзацы) — `lib/office/scripts.ts`: для `site`:
  приветствие с именем компании и городом, «мы сделали вам страницу-визитку, откройте ссылку …»,
  предложение (цена `prices.sitePrice` и `prices.siteMonthly`), ответы на «дорого/зачем/подумаю»
  (коротко); для `provider`: «ИИСтройка24 — бесплатная площадка заявок на спецтехнику по всей
  России; мы уже сделали вашу страницу…, заказчики смогут заказывать у вас напрямую; бесплатно и без
  посредников (`packages/shared/src/promise.ts`)», как встать на линию. В конце — «Дальше: отметить
  результат».
- Компоненты `components/office/OfficeSitePage.tsx`, `components/office/OfficeProviderPage.tsx`,
  `components/office/PreviewBanner.tsx` (серверные, Tailwind; акцентный цвет из ниши через классы;
  без внешних картинок; мобильная вёрстка 16px). Страница сайта (вариант 1) **без** шапки/подвала
  платформы: отдельный layout `app/s/layout.tsx` и `app/preview/layout.tsx` (минимальный, без
  навигации платформы; внизу тонкая строка «Сайт сделан ИИСтройка24 от СпецПласт16»). Страница
  подрядчика (вариант 2) — в обычном layout платформы.
- Маршруты:
  - `GET /preview/[token]` — любой статус кроме `DECLINED`; баннер «Предпросмотр: страница сделана
    для «<name>». Будет опубликована после согласия владельца компании»; `metadata.robots =
    { index: false, follow: false }`; телефон показывается (R13).
  - `GET /s/[slug]` — только `kind='site' && status='PUBLISHED'`, иначе `notFound()`; индексируется.
  - `GET /p/[slug]` — только `kind='provider' && (status='PUBLISHED' || 'REGISTERED')`, иначе 404.
  - `robots.ts`: добавить `/preview` в `disallow`. В `sitemap.ts` не добавлять (владелец не просил).
- Публичные ответы не содержат id, token, note, статусов (R19) — страницы серверные, в разметку
  попадают только поля страницы.

## 6. Админка `/admin/office` и API (R2, R4, R7, R15, R16)

- Пункт в `AdminNav`: `{ href: '/admin/office', label: 'Офис' }` (после «Звонки»).
- Страница (серверная, `adminGate()`): шапка `AdminPageHeader` «Офис агентов»; плитки `StatTile`:
  «Звонить сегодня», «Готово превью», «Опубликовано», «Отказов»; две карточки агентов (имя,
  описание, последний прогон из `OfficeRun`, следующий шаг плана, кнопка «Запустить шаг» — форма
  ниша+город); список «Кому звонить» (status READY, затем CALLBACK с `callAt` ≤ сегодня; сорт.
  город, дата): название, `PhoneLink`, город, ниша, ссылка «Превью», раскрывающийся «Текст звонка»
  (`<details>`), поле заметки, кнопки «Согласился», «Перезвонить» (дата, по умолчанию завтра),
  «Отказ» (клиентский компонент `components/admin/OfficeProspectControls.tsx`, `fetch PATCH`);
  список «Опубликовано» (ссылка на страницу, дата, для подрядчика — «зарегистрировался» при
  REGISTERED); «Добавить вручную» — textarea + агент → `POST /api/admin/office/manual`; «План обхода»
  — textarea с планом, кнопка «Сохранить», переключатель паузы; «Цены сайта» — два числа (R16);
  журнал последних 20 прогонов.
- API (все — `isAdminRequest()`, иначе 401; тела — zod; ответы без лишних полей):
  - `POST /api/admin/office/run` `{agent, niche, city}` → `runStep(trigger:'admin')` → `{found, created, skipped, error?}`.
  - `POST /api/admin/office/manual` `{agent, text}` → `parseManualLines` → создание как в п. 4 → `{created, errors: string[]}`.
  - `PATCH /api/admin/office/prospects/[id]` `{action: 'agree'|'callback'|'decline'|'note', callAt?, note?}` —
    переходы: READY|CALLBACK → AGREED (сразу PUBLISHED: `agreedAt`, `publishedAt`, status
    PUBLISHED — одно действие «Согласился» публикует, R12), → CALLBACK (`callAt`), → DECLINED
    (`declinedAt`); из PUBLISHED можно только DECLINED (снять с публикации). Недопустимый переход — 409.
  - `PUT /api/admin/office/settings` `{plan?, paused?, sitePrice?, siteMonthly?}` → `AppSetting`;
    план проверяется `parsePlan`, ошибки строк возвращаются.
- Цены: `lib/prices.ts` → `export const SITE_PRICES = { setup: 15000, monthly: 1500 }` (PLACEHOLDER
  в комментарии) и `lib/office/prices.ts` → `officePrices()` читает `AppSetting`, падает на
  `SITE_PRICES`.

## 7. Крон и сводка (R1, R3)

- `GET /api/cron/office` (`cronAllowed`, `force-dynamic`, `maxDuration = 60`): 1) `runScheduledStep`
  — один шаг плана; 2) если московское время 08:00–10:59 — `onceADay('office-digest', …)` → сводка
  владельцу через `notifyTelegram` (HTML/обычный текст, как остальные): «Офис за сутки: Подрядчики —
  найдено N, страниц M; Сайты — …; Звонить сегодня (K): 1. <name> · <город> · <ниша> · <телефон> ·
  превью: <siteUrl>/preview/<token>; …; Перезвонить сегодня: …; Открыть офис: <siteUrl>/admin/office».
  Не больше 10 строк кандидатов, остальное — «и ещё N в админке». Когда нечего — «Офис: за ночь
  новых кандидатов нет, план на паузе/шаг такой-то».
- `.github/workflows/bot-reminders.yml` — один дополнительный шаг `curl -fsS -H "Authorization:
  Bearer $CRON_SECRET" https://spec-ai-web.vercel.app/api/cron/office || true` (маленький хунк,
  общая зона).
- Текст сводки — чистая функция `buildDigest(...)` в `lib/office/digest.ts` с тестом.

## 8. Регистрация по ссылке (R17)

- `QuickProviderForm` уже на `/register`; предзаполнение из query (`name`, `phone`, `city`) —
  если формы это не умеют, добавить чтение `useSearchParams` только для начальных значений
  (маленький хунк). `POST /api/auth/quick-provider` принимает необязательный `prospect` (slug,
  `/^[a-z0-9-]{3,80}$/`); после успешного создания — `prisma.prospect.updateMany({ where: { slug,
  kind: 'provider', status: { in: ['PUBLISHED','AGREED'] } }, data: { status: 'REGISTERED',
  registeredAt } })` — не блокирует регистрацию при ошибке. Ответ не меняется.

## 9. Telegram (необязательно, если остаётся бюджет)

- Команда владельца в личке бота `/office <ниша> <город>` (только из `TELEGRAM_CHAT_ID`) →
  `runStep(trigger:'telegram')` → ответ «Найдено N, создано M, превью в /admin/office». Хунк в
  `api/integrations/telegram/route.ts` — до 15 строк, разбор текста — `lib/office/telegramCommand.ts` с тестом.

## 10. Ошибки

- Overpass недоступен → шаг завершён с `error: 'Источник не ответил'`, курсор всё равно сдвинут,
  сводка показывает «источник карт не отвечал».
- Город не найден в списке → строка плана пропускается, ошибка в журнале.
- Публикация без телефона невозможна — у кандидата телефон обязателен с создания.

## 11. Права (R19)

- `/admin/office/**`, `/api/admin/office/**` — `isAdminRequest()`; `/api/cron/office` — `cronAllowed`;
  `/preview/[token]` — по токену 32 hex; `/s`, `/p` — публичные только для опубликованных.
- Телефон компании на `/p/<slug>` показывается (компания согласилась; с 2026-11-08 телефоны
  исполнителей и так на карте), на превью — тоже; маска не нужна — это не заказчик и не свободный текст.

## 12. Рассылка кандидатам (R18, решение владельца 2026-11-09)

- Схема: колонки `Prospect.email`, `whatsapp`, `telegram`, `emailSentAt`, `whatsappSentAt`,
  `contactedAt`, `repliedAt`, `outreachError`; статус `CONTACTED` (после хотя бы одной отправки).
  Источник OSM собирает `email|contact:email`, `contact:whatsapp`, `contact:telegram`.
- `lib/office/outreach.ts`: чистые `buildEmail(p, niche, {previewUrl, prices, replyTo}) → {subject, text, html}`
  и `buildWhatsAppText(p, …) → string` — по агенту (сайт / подрядчик): кто мы (`SITE.company`,
  `SITE.platform`), что сделали, ссылка на превью, предложение (цены для сайта; «бесплатно и без
  посредников» для подрядчика), как ответить («ответьте на это письмо / сообщение»), строка «Если не
  нужно — ответьте «стоп», больше не напишем». Без выдуманных цифр, без «лучшая цена/гарантируем».
  `pickChannels(p, settings) → ('email'|'whatsapp')[]`: e-mail — если есть адрес и `emailSentAt` null;
  WhatsApp — если `whatsapp` указан или (`settings.whatsappToPhone` и телефон мобильный `+79…`) и
  `whatsappSentAt` null и канал настроен (`serverChannels().whatsapp`).
- `sendOutreach(limitPerChannel, now)` в `lib/office/outreachRun.ts`: берёт `Prospect` со статусом READY
  (и CONTACTED с неотправленным вторым каналом), `orderBy createdAt asc`, `take` по лимиту, отправляет
  через `sendEmail` (`@/lib/email`, `replyTo` из настроек `office.replyTo`, по умолчанию `SITE.email`)
  и `sendWhatsApp` (`@/lib/notifications/adapters`); пишет `*SentAt`, `contactedAt`, статус CONTACTED,
  ошибки — в `outreachError`; дневной лимит на канал — `office.dailyCap` (по умолчанию 20), считается по
  `*SentAt` за московские сутки. Пауза — `office.outreachPaused`.
- Крон `/api/cron/office`: после шага поиска — `sendOutreach`, если не пауза. Сводка владельцу:
  «отправлено писем N, WhatsApp M, ответили K».
- Ответы: WhatsApp — уже существующий вебхук `/api/integrations/whatsapp` создаёт заявку и шлёт
  владельцу в Telegram; дополнительно `markReplied(phoneDigits)` помечает `repliedAt` у кандидата с
  таким `whatsapp`/`phone`, текст «стоп» → статус DECLINED. E-mail — ответы приходят на `replyTo`
  (почта владельца); отметка «ответил» — вручную в админке.
- Админка: карточка «Рассылка» — пауза, лимит в день, адрес для ответов, флажок «WhatsApp на обычный
  мобильный из карточки» (по умолчанию выкл.), счётчики за сегодня; у кандидата — значки «✉ отправлено
  дд.мм», «WA отправлено», «ответил», Telegram-контакт ссылкой `https://t.me/<name>` для ручного письма.
- Статусы: READY → CONTACTED → (AGREED→PUBLISHED | CALLBACK | DECLINED); владелец по ответу жмёт
  «Согласился». «Перезвонить» переименовать в «Напомнить» (дата) — офис в сводке напомнит.
