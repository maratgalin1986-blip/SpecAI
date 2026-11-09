# Спецификация: «Сайты под ключ» как бизнес (S1…S12)

Готово координатором (общий фундамент, не переписывать):

- Схема: `Prospect.siteJson, domain (@unique), setupPrice, monthlyPrice, setupPaidAt, paidUntil,
followUpSentAt`; модель `SiteLead {id, prospectId, name, phone, message?, forwardedAt?, forwardError?, createdAt}`.
- `lib/office/siteContent.ts`: `parseSiteContent(raw)`, `validateSiteContent(input)`,
  `applySiteContent(page, content)`, `SITE_ACCENTS`, `SITE_CONTENT_LIMITS`, `PHOTO_URL`.
- `SitePage` дополнен полями `about: string|null`, `photos: string[]`, `leadForm: boolean`
  (`buildSitePage` ставит null/[]/true).
- `lib/prices.ts`: `SitePackage`, `sitePackages(base)`, `SITE_DOMAIN_SETUP_EXTRA`; база —
  `officePrices()` из `lib/office/prices.ts`.
- `lib/office/domains.ts`: `normalizeHost`, `isPlatformHost`, `normalizeDomain`, `domainKeys`.

Общие правила для всех задач: Next.js 15 — `params`/`searchParams` в страницах и маршрутах —
`Promise` (`props: { params: Promise<{ id: string }> }`, `await props.params`); `noUncheckedIndexedAccess`
— в тестах индексация через `!`; тексты по-русски (REVIEW § 5), без имён моделей ИИ, без выдуманных
отзывов и цифр, без «лучшая цена/гарантируем»; админ-маршруты — `isAdminRequest()` → 401 «Нет доступа»;
публичные маршруты — лимиты, ответы без id и служебных полей; списки из базы — с `take` и `orderBy`.

## T1. Страница услуги и примеры (S2, S3)

Файлы: `app/sajt-pod-klyuch/page.tsx`, `app/sajt-pod-klyuch/primer/[niche]/page.tsx`,
`components/office/landing/**`, `lib/office/landing.ts` (+ тест).

- Страница: заголовок «Сайт для вашего бизнеса — готов до разговора», суть (мы уже делаем сайт по
  данным вашей карточки на карте; смотрите бесплатно, решаете потом), 3 шага, что входит, пакеты
  (`sitePackages(await officePrices())` — карточки с ценами), примеры (карточки ниш агента «Сайты» →
  `/sajt-pod-klyuch/primer/<ключ>`), вопросы и ответы (6–8: сколько стоит, что нужно от меня, можно ли
  свой домен, как приходят заявки, как поменять тексты, что если не понравится, договор и оплата),
  форма «Хочу сайт» — через существующий `lib/submitLead.ts`/`/api/leads` с `source: 'sajt-pod-klyuch'`
  (имя, телефон, чем занимаетесь, город, согласие `ConsentText`); метаданные, canonical, `revalidate = 600`.
- Пример: вымышленная компания «Ваша <ниша>» (город «Казань»), `OfficeSitePage` с баннером «Пример
  сайта: компания вымышленная. Ваш сайт будет с вашими данными». Телефон — телефон СпецПласт16
  (`SITE.phone`), а не выдуманный. `robots: noindex`. Неизвестная ниша → 404.
- `lib/office/landing.ts`: `LANDING_STEPS`, `LANDING_FAQ`, `demoProspect(nicheKey)` (чистые) + тест.

## T2. Клиентский сайт: правки, фото, форма заявки, подвал, sitemap (S4 UI, S5, S11)

Файлы: `components/office/OfficeSitePage.tsx`, `components/office/SiteLeadForm.tsx` (клиентский),
`app/s/[slug]/page.tsx`, `app/preview/[token]/page.tsx`, `lib/office/visibility.ts` (выбрать `siteJson`,
`domain`), `app/sitemap.ts`.

- Страницы `/s` и `/preview` (для kind site): `applySiteContent(buildSitePage(...), parseSiteContent(p.siteJson))`.
- `OfficeSitePage`: блок «О компании» (если `about`), галерея фото (до 6, `<img loading="lazy">` с alt
  «Фото: <название>»), блок формы заявки (если `leadForm`): `SiteLeadForm` с `slug`; в превью —
  форма показана, но выключена с подписью «Форма заработает после публикации»; подвал: «Хотите такой же
  сайт?» → абсолютная ссылка `${siteUrl()}/sajt-pod-klyuch?utm_source=client-site&utm_campaign=<slug>`.
- `SiteLeadForm`: имя, телефон, комментарий, галочка «Согласен на передачу имени и телефона компании
  «<название>» для ответа на заявку», скрытое поле-ловушка `website`; POST `/api/office/site-lead`
  `{ slug, name, phone, message, consent, website }`; состояния «Отправляем…», «Заявка отправлена —
  с вами свяжутся», ошибка из ответа.
- Скрытие оболочки площадки на клиентском домене (T6 делает атрибуты): страница `/s/[slug]` вставляет
  `<style>` с `[data-platform-chrome]{display:none!important}`.
- canonical: если в заголовках запроса есть `x-client-domain` (ставит middleware, T6) — `https://<домен>/`,
  иначе `/s/<slug>`.
- sitemap: опубликованные `/s/<slug>` (kind site, PUBLISHED) и `/p/<slug>` (kind provider, PUBLISHED или
  REGISTERED), `take: 5000`, `orderBy: publishedAt desc`, ошибки базы не роняют sitemap.

## T3. Заявки с клиентских сайтов — приём и пересылка (S4)

Файлы: `app/api/office/site-lead/route.ts`, `lib/office/siteLeads.ts` (+ тест).

- Тело (zod): `slug` `^[a-z0-9-]{3,80}$`, `name` 1–80, `phone` (`candidatePhone` из `sources/phone.ts`),
  `message` ≤ 1000, `consent: true`, `website` (ловушка: непустое → 200 `{ ok: true }` без сохранения).
- Проверки: кандидат kind site и status PUBLISHED; `parseSiteContent(siteJson).leadForm !== false`;
  лимит по IP 5 за 10 минут (`checkRateLimit`, `clientIp` из `lib/loginErrors`), в базе ≤ 50 заявок на
  сайт за сутки (count SiteLead). Сохранить `SiteLead`.
- Пересылка: если у кандидата есть `email` — `sendEmail` (тема «Заявка с сайта: <имя>», текст и HTML с
  экранированием: имя, телефон ссылкой, комментарий, «Заявка пришла с вашего сайта <адрес>. Сайт сделан
  ИИСтройка24 от СпецПласт16»), успех → `forwardedAt`, иначе `forwardError` (по-русски, ≤ 300).
  Владельцу — одна строка `notifyTelegram`: «Заявка с сайта <компания>: <имя>, <телефон>» + «не
  доставлена клиенту» при ошибке.
- Ответ: `{ ok: true }` или `{ error }` (400/404/429); без id. Чистая часть — `acceptSiteLead(input, deps)`
  с внедрением db, sendEmail, notify, now → тесты: ловушка, неопубликованный, выключенная форма, лимит,
  нет почты → forwardError, экранирование HTML.

## T4. Редактор сайта и домен в админке (S5, S7-поле)

Файлы: `app/admin/office/[id]/page.tsx`, `components/admin/OfficeSiteEditor.tsx`,
`app/api/admin/office/prospects/[id]/site/route.ts`, `app/api/admin/office/upload/route.ts`,
тест чистой части, если появится (`lib/office/siteEditor.ts`).

- Страница (adminGate, force-dynamic, noindex): карточка кандидата (название, ниша, город, телефон,
  статус), ссылки «Превью» и «Сайт» (`/s/<slug>`, если опубликован), редактор, поле «Свой домен» с
  подсказкой DNS («у регистратора: запись A @ → 76.76.21.21 и CNAME www → cname.vercel-dns.com; затем
  владелец добавляет домен в Vercel → Domains»), последние 50 заявок с сайта (`SiteLead`: дата, имя,
  телефон, комментарий, «доставлено/нет»), ссылка «Назад в офис».
- Редактор (клиентский): поля siteContent (title, hero, about, услуги — список строк с добавлением и
  удалением, hours, address, phone, whatsapp, accent — выбор, leadForm — галочка), фото — загрузка
  `POST /api/admin/office/upload` (multipart `file`, только JPEG/PNG/WebP ≤ 5 МБ) → url, удаление,
  до 6; «Сохранить» → PUT `/api/admin/office/prospects/<id>/site` `{ content, domain }`; затем `router.refresh()`.
- PUT: `validateSiteContent(content)` → `siteJson` (пустой объект → null); `normalizeDomain(domain)`;
  уникальность домена (P2002) → 409 «Этот домен уже у другого сайта»; ответ `{ ok: true }`.
- upload: `isAdminRequest`, проверки типа и размера (`lib/blob.ts`), `storeFile('office/<имя>', file)`
  (посмотри, что возвращает `lib/fileStore.ts`, и верни url, проходящий `PHOTO_URL`), лимит 30/мин.

## T5. Клиенты и оплата (S6)

Файлы: `lib/office/billing.ts` (+ тест), `app/api/admin/office/prospects/[id]/payment/route.ts`,
`app/admin/office/clients/page.tsx`, `components/admin/OfficeClientControls.tsx`,
`components/admin/OfficePayDetailsForm.tsx`, `app/oplata/[token]/page.tsx`, `lib/office/settings.ts`
и `app/api/admin/office/settings/route.ts` (только добавить `payDetails`, ключ `office.payDetails`,
строка ≤ 2000), `app/robots.ts` (добавить `/oplata` в disallow).

- billing (чистые): `clientPrices(p, defaults)` → `{ setup, monthly }` (поля клиента или база);
  `extendPaidUntil(current, now, months)` — от max(current, now), по календарным месяцам;
  `billingStatus(p, now)` → `'unpaid' | 'active' | 'expiring' | 'overdue'` (expiring — ≤ 7 дней до
  `paidUntil`); `monthlyRevenue(clients, defaults, now)` — сумма `monthly` у active/expiring.
- payment POST `{ action: 'setup' | 'month' | 'year' | 'undo', setupPrice?, monthlyPrice? }`:
  setup → `setupPaidAt = now` (и `paidUntil` = +1 мес, если пусто); month/year → `extendPaidUntil`;
  undo → обнулить `setupPaidAt` и `paidUntil`; цены (целые 0…1 000 000) сохраняются; только kind site
  и статус PUBLISHED/AGREED; ответ `{ ok: true, paidUntil }`.
- Страница «Клиенты»: опубликованные сайты (kind site, PUBLISHED, take 500, orderBy publishedAt desc):
  название, город, ниша, цены, «Сайт оплачен дд.мм» / «не оплачен», «Оплачено до», статус цветом,
  кнопки (OfficeClientControls), ссылка «Счёт для клиента» (`/oplata/<token>`, копировать), «Редактировать»
  (`/admin/office/<id>`); сверху плитки: клиентов, оплатили, выручка в месяц, истекает за 7 дней,
  просрочено; форма «Реквизиты для оплаты» (`OfficePayDetailsForm` → PUT settings `payDetails`).
- `/oplata/[token]` (публичная по токену 32 hex; только kind site и статус AGREED/PUBLISHED; noindex,
  force-dynamic): «Счёт за сайт для <компания>», пакет и суммы (`clientPrices`), «Оплачено до» если
  есть, что входит (`sitePackages`), реквизиты из `office.payDetails` (pre-wrap) или «Реквизиты пришлём
  в ответ на письмо — или позвоните <SITE.phone>», ссылка на сайт/превью; без id и служебных полей.

## T6. Свой домен клиента: карта хостов и middleware (S7)

Файлы: `app/api/office/domains/route.ts`, `lib/office/domainMap.ts` (+ тест), `middleware.ts` (хунк),
атрибут `data-platform-chrome` на корневых элементах оболочки: `components/SiteHeader.tsx`,
`components/SiteFooter.tsx` (или обёртка в нём), `components/MessengerButtons.tsx`,
`components/AgentChatWidget.tsx`, `components/TelegramChip.tsx` (и другие плавающие виджеты корневого
layout, если есть) — только атрибут, без изменения поведения. Корневой `app/layout.tsx` НЕ трогать.

- GET `/api/office/domains` (публичный, без личных данных): `{ sites: [{ host, slug }] }` для kind site,
  PUBLISHED, domain not null (`domainKeys` → оба хоста), `take 2000`; `Cache-Control: s-maxage=300`.
- `domainMap.ts`: `parseDomainMap(json)` → `Map<host, slug>`; кэш в памяти модуля на 5 минут
  (`getDomainMap(fetcher, now)`), при ошибке — прошлый кэш или пустая карта.
- middleware: если `!isPlatformHost(host)` и путь страницы — найти slug; есть → `NextResponse.rewrite`
  на `/s/<slug>` (любой путь страницы ведёт на главную клиента) с заголовком запроса
  `x-client-domain: <host>`; нет → как раньше. Не ломать существующую логику (legacy redirect, ref,
  /dashboard).

## T7. Письма: напоминание и ссылки на услугу (S8, S12)

Файлы: `lib/office/outreach.ts`, `lib/office/outreachRun.ts` и их тесты.

- В письмах и WhatsApp kind site: ссылка «Кто мы и цены» → `<base>/sajt-pod-klyuch?utm_source=email&utm_campaign=<slug>`
  (WhatsApp — `utm_source=whatsapp`), строка «Заявки с сайта будут приходить вам на почту». Строка «стоп»
  остаётся последней.
- `buildFollowUpEmail(p, input)`: короткое напоминание («На прошлой неделе мы сделали страницу для …,
  посмотрите — это 30 секунд»), ссылка превью, «стоп».
- В `sendOutreach` после основного прохода — проход напоминаний: status CONTACTED, `emailSentAt ≤ now − 4 дня`,
  `followUpSentAt` null, `repliedAt` null, `email` не пуст; в общем дневном лимите писем (считать и
  `followUpSentAt` за сутки), в бюджете времени, защищённый `updateMany` (status in CONTACTED) ставит
  `followUpSentAt`. Результат: поле `followUps`. WhatsApp-напоминаний нет.

## T8. Ниши, воронка, сводка (S9, S10, строки сводки S4/S6)

Файлы: `lib/office/niches.ts`, `lib/office/agents.ts` (defaultNiches «Сайтов»), `lib/office/funnel.ts`
(+ тест), `components/admin/OfficeFunnel.tsx`, `lib/office/digest.ts` (+ тест).

- +8 ниш агента «Сайты» (ключ, title, OSM-теги, `dgisQuery`, 6–8 услуг, heroLine с «в городе {city}»,
  accent): cafe (кафе/столовая), car_wash (автомойка), fitness (фитнес/спортзал), lawyer (юридические
  услуги), accounting (бухгалтерские услуги), repair (ремонт техники и электроники), florist (цветы),
  building_materials (стройматериалы). Проверь существующие ключи и регулярки (урок 18).
- funnel: по агенту — найдено (все Prospect), написали (contactedAt), ответили (repliedAt), согласились
  (agreedAt), оплатили (setupPaidAt), активные (paidUntil ≥ now); доли от «написали»; выручка в месяц;
  заявки с клиентских сайтов за 30 дней. `collectFunnel(db, now)` (count-запросы) + чистый `funnelRows`.
  `OfficeFunnel` — серверный компонент таблицы для `/admin/office`.
- digest: строки «Заявок с клиентских сайтов: N (не доставлено клиентам: M)» и «Оплата: истекает за
  7 дней — N, просрочена — M» (только если > 0); расширить `DigestDb` и тесты.

## Интеграция (координатор)

`/admin/office`: воронка, ссылки «Клиенты» и «Редактировать сайт» у кандидатов, «Страница услуги»;
REVIEW.md — новые публичные адреса; документы; ревью; приёмка.

## Вторая волна (S13–S17) — после первой

Готово координатором: `lib/office/dossier.ts` (`buildDossier`, `parseDossier`, `parseHours`),
`lib/office/offer.ts` (`applicableAngles`, `buildOffer`, `OFFER_ANGLES`, `ANGLE_TITLES`, `NICHE_NEEDS`),
`lib/office/learning.ts` (`chooseAngle`, `collectAngleStats`, `learningTable`); схема: `dossierJson`,
`offerAngle`, `offerJson`, `previewViews` (default 0), `previewViewedAt`.

### U1. Источники отдают всех, досье при создании

Файлы: `lib/office/sources/osm.ts`, `lib/office/sources/dgis.ts` (+ их тесты), `lib/office/run.ts` (+ тест).

- Источники больше не отбрасывают фирмы с сайтом (нужны для подсчёта конкурентов); лимит — как есть.
- `runStep`: из полного ответа источника — кандидаты без сайта (как сейчас: дедуп, `STEP_LIMIT`), а для
  каждого созданного — `buildDossier({ candidate, neighbors: все кандидаты ответа, niche, nicheTitle, city })`
  → `dossierJson`. `createManualProspects` — досье без соседей. Тесты: досье записано, конкуренты
  посчитаны по ответу источника, фирмы с сайтом кандидатами не стали.

### U2. Письма из персонального предложения, ИИ-аналитик

Файлы: `lib/office/outreach.ts`, `lib/office/outreachRun.ts` (+ тесты), `lib/office/aiOffer.ts` (+ тест),
`lib/office/settings.ts`, `app/api/admin/office/settings/route.ts` (ключи `office.aiOffers` '1'/'0',
`office.aiDailyCap` целое 0…500, по умолчанию 30).

- `sendOutreach`: один раз за проход `collectAngleStats(db, kind)`; для каждой строки — досье
  (`parseDossier`), заход `chooseAngle(applicableAngles(d), stats)`, `buildOffer`; если включён ИИ и не
  исчерпан дневной лимит — `improveOffer(offer, dossier, …)` из `aiOffer.ts`; письмо и WhatsApp (kind site)
  строятся из предложения: тема = `offer.subject`, вступление = `offer.opener`, пункты = `offer.bullets`,
  рекомендованный пакет с ценой; дальше — как сейчас (ссылка превью, «кто мы и цены», «стоп» последней).
  При успешной отправке (защищённый updateMany) записать `offerAngle` и `offerJson` (JSON предложения с
  полем `ai: boolean`). Подрядчиков (kind provider) не менять.
- `aiOffer.ts`: `improveOffer(offer, dossier, deps)` — только если `ANTHROPIC_API_KEY` есть; клиент и модель
  — `getAnthropicClient`, `DEFAULT_MODEL` из `@specai/ai-service` (модель можно переопределить
  `OFFICE_AI_MODEL`); короткий системный промпт (переписать вступление и 3 пункта живым русским языком,
  только по фактам досье, без цифр, которых нет в досье, без «лучший/гарантируем», без имён моделей);
  `max_tokens` 350, ответ — JSON `{ opener, bullets[3] }`; проверка: длина, нет новых цифр, нет
  запрещённых слов; любой сбой → исходное предложение. Таймаут 8 с. Тесты с подменой клиента.

### U3. Просмотры превью, админка, сводка, интеграция первой волны

Файлы: `app/preview/[token]/page.tsx` (учёт просмотров), `app/admin/office/page.tsx`,
`app/admin/office/[id]/page.tsx` (блок досье и предложения), `components/admin/OfficeLearning.tsx`,
`components/admin/OfficeAiForm.tsx`, `lib/office/digest.ts` (+ тест).

- Превью: если запрос не от админа (`isAdminRequest()`) и не от бота (User-Agent: bot|crawl|spider|preview|
  facebookexternalhit|telegram|whatsapp|vkshare|yandex|google — превью ссылок в мессенджерах тоже боты),
  `updateMany` по токену: `previewViews +1`, `previewViewedAt` — если пусто. Ошибка учёта не ломает страницу.
- `/admin/office`: воронка (`OfficeFunnel` из первой волны), ссылки «Клиенты» (`/admin/office/clients`),
  «Страница услуги» (`/sajt-pod-klyuch`), у кандидатов — «Досье и сайт» (`/admin/office/<id>`), значок
  «открыл превью ×N»; блок «Чему научился офис» (`learningTable(await collectAngleStats(prisma))` —
  заход, отправлено, открыли %, ответили %, согласились, «лидер»); блок «Горячие» — открыли превью за 7 дней
  и не ответили; форма «ИИ-аналитик» (выключатель + лимит, состояние ключа «есть/нет» без значения).
- `/admin/office/<id>`: блок «Досье» (факты, пробелы, конкуренты рядом), «Предложение» (как отправлено —
  из `offerJson`, иначе как будет — `buildOffer` с первым подходящим заходом), просмотры превью.
- Сводка: «Лучший заход: <название> (ответили N из M)», если есть данные; «Горячие (открыли превью): …» —
  до 5 строк.

## Третья волна — выводы бизнес-плана (`docs/business/sajty-pod-klyuch.md`, К1–К17)

Готово координатором: колонка `Prospect.optOutAt`; зависимость `nodemailer` в apps/web.

### V1. Письма со своего ящика, утверждение владельцем, отписка, напоминания (К1–К4)

Файлы: `lib/office/smtp.ts` (+ тест), `lib/office/outreach.ts`, `lib/office/outreachRun.ts` (+ тесты),
`lib/office/unsubscribe.ts` (+ тест), `app/otpiska/[token]/page.tsx` и `app/api/office/unsubscribe/route.ts`,
`app/admin/office/pisma/page.tsx`, `components/admin/OfficeOutboxControls.tsx`,
`app/api/admin/office/outreach/route.ts`, `lib/office/settings.ts` и маршрут настроек (ключ
`office.outreachMode` 'approve' | 'auto', по умолчанию 'approve'), `lib/office/digest.ts` (+ тест),
`lib/office/tick.ts` (+ тест).

- К1: холодные письма (первое и напоминание) — только через `sendOfficeMail` (nodemailer, SMTP из переменных
  `OUTREACH_SMTP_HOST` (по умолчанию smtp.yandex.ru), `OUTREACH_SMTP_PORT` (465), `OUTREACH_SMTP_USER`,
  `OUTREACH_SMTP_PASS`, `OUTREACH_FROM` (по умолчанию user)); `officeMailConfigured()`. Никогда не через
  Resend (`lib/email.ts`): нет SMTP — письма не уходят, причина `no-smtp` без записи ошибок в строки.
  Пересылка заявок с клиентских сайтов (siteLeads.ts) остаётся на Resend.
- К2: режим 'approve' (по умолчанию): тик крона НЕ отправляет письма; вместо этого готовит «письма дня»
  (у строк без `offerJson` выбирает заход и сохраняет `offerAngle`/`offerJson` — то, что утверждается, то и
  уходит). Страница `/admin/office/pisma` (adminGate с await): список первых писем и напоминаний на сегодня
  в пределах дневного лимита — кому (название, город, адрес почты), тема, вступление, пункты; галочки
  «не отправлять»; кнопка «Отправить N писем» → POST `/api/admin/office/outreach` `{ send: true, exclude: id[] }`
  → `sendOutreach(now, { budgetMs, onlyApproved })` (отправка по клику владельца — «с участием человека»);
  ответ — числа. Режим 'auto' — как сейчас (по крону), с предупреждением в админке про ч. 2 ст. 18.
  Сводка: «Письма дня ждут вашего «Отправить»: N — <siteUrl>/admin/office/pisma».
- К3: в каждом холодном письме — строка «Больше не писать: <ссылка>» и заголовок `List-Unsubscribe`;
  ссылка `/otpiska/<token>?s=<HMAC от token>` (секрет — `CRON_SECRET` или `NEXTAUTH_SECRET`) → страница с
  кнопкой «Больше не писать» (POST, чтобы превью ссылок в почте не отписывали сами) → `optOutAt`,
  статус DECLINED, `declinedAt`; офис не пишет на адрес, если у любой строки с таким же `email` есть
  `optOutAt`. Ответ «стоп» (WhatsApp) — как раньше.
- К4: напоминания тоже идут через «письма дня» (в режиме approve).

### V2. Продажа и юридические страницы (К6, К10, К12, К16, К17, раздел 8.2)

Файлы: `lib/office/pages.ts` (+ тест), `lib/office/pageTypes.ts`, `lib/office/siteContent.ts` (+ тест),
`components/office/OfficeSitePage.tsx`, `components/office/SiteLeadForm.tsx`, `components/office/PreviewBanner.tsx`,
`app/preview/[token]/page.tsx`, `app/s/[slug]/page.tsx`, `app/s/[slug]/politika/page.tsx`,
`lib/office/siteLeads.ts` (+ тест), `lib/office/transitions.ts` (+ тест),
`app/api/admin/office/prospects/[id]/route.ts`, `components/admin/OfficeProspectControls.tsx`,
`components/admin/OfficeSiteEditor.tsx`, `lib/prices.ts`, `lib/office/prices.ts` (+ тест),
`lib/office/billing.ts` (+ тест), `app/oplata/[token]/page.tsx`, `app/admin/office/clients/page.tsx`,
`components/admin/OfficeClientControls.tsx`, `lib/office/landing.ts` (если нужно для цен/WhatsApp).

- К6: плашка превью — «Черновик: подготовлен ИИСтройка24 по открытым данным карточки на карте. Это не
  официальный сайт компании». Если источник OSM — строка «Данные карточки: © участники OpenStreetMap».
- 8.2: кнопки WhatsApp на клиентском сайте — только если WhatsApp указан в карточке (`Prospect.whatsapp`)
  или в правках; иначе нет (`SitePage.whatsappHref: string | null`). Пример на странице услуги — как есть.
- К10: для kind site «Согласился» → статус AGREED (не публикует); новое действие «Опубликовать»
  (AGREED → PUBLISHED, `publishedAt`), в админке рядом с оплатой; если сайт не оплачен — подтверждение
  «Сайт не оплачен — опубликовать?». Для kind provider — как раньше (сразу PUBLISHED). Форма заявки
  выключена по умолчанию (`leadForm` по умолчанию false; включается в редакторе галочкой «Форма заявки —
  только после принятия клиентом оферты и согласия на поручение»); siteLeads принимает заявку только при
  `leadForm === true`. Владельцу в Telegram о заявке с сайта — только «Заявка с сайта <компания>
  (доставлена/не доставлена)», без имени и телефона посетителя.
- Подвал «Хотите такой же сайт?» — убирается галочкой в редакторе (`siteContent.hideCredit`).
- К12: цены по умолчанию `SITE_PRICES = { setup: 3900, monthly: 990, yearly: 9900 }`, настройка
  `office.siteYearly`; в пакетах и на счёте — вариант «на год»; действие оплаты 'year' продлевает на 12 мес.
- К16: на странице счёта (после оплаты) и в админке «Клиенты» — инструкция «Как поставить ссылку на сайт в
  карточку Яндекс Карт и 2ГИС» (шаги текстом).
- К17: `/s/<slug>/politika` — политика обработки персональных данных посетителей сайта: оператор —
  компания (название и адрес из карточки), обработка по поручению — СпецПласт16 (`SITE`), какие данные
  (имя, телефон, комментарий), цель (ответ на заявку), хранение в России, срок, как отозвать согласие;
  noindex. Галочка в форме — со ссылкой на неё.

### V3. Чистота поиска и запас кандидатов (К5, К15)

Файлы: `lib/office/candidateFilter.ts` (+ тест), `lib/office/run.ts` (+ тест), `lib/office/agents.ts`,
`lib/office/plan.ts`/`plan.test.ts` (если нужно), `lib/office/funnel.ts` (+ тест), `components/admin/OfficeFunnel.tsx`.

- К5: не делать кандидатами ИП и людей: название начинается с «ИП »/«И.П.», содержит «индивидуальный
  предприниматель», или похоже на ФИО (2–3 слова с заглавной, одно из окончаний -ович/-евич/-овна/-евна/-ична
  или «Фамилия И. О.»); такие — в `skipped` с причиной. Медицинские ниши (стоматология — реклама медуслуг,
  ст. 24 закона «О рекламе») — убрать из ниш по умолчанию агента «Сайты» (ниша остаётся для ручных строк плана).
- К15: в воронке — «Запас кандидатов с почтой: N (≈ D рабочих дней при лимите L в день)» по агентам.
