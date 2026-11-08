# Аудит безопасности ИИСтройка24 от СпецПласт16 — 2026-11-08

Проверен `origin/main` (59fbcc4), только чтение. Код не менялся.

## Что опасно сейчас (для владельца, 5 строк)

1. **Сайт работает на устаревшем Next.js 14.2.35 с тремя «критическими» дырами (удалённое выполнение кода без входа).** Это самое срочное: обновить фреймворк в ближайшие дни.
2. **Любой зарегистрированный исполнитель видит точный адрес объекта заказчика** в API заявок до подтверждения брони, а с подтверждённой почтой может открывать до 30 телефонов заказчиков в сутки на компанию. Создать такие аккаунты бесплатно может кто угодно — риск сбора базы клиентов конкурентами.
3. **Ограничения «не чаще N раз» (вход, заявки, админ-пароль) живут в памяти одной серверной функции** — на Vercel их легко обойти, а у админки один общий пароль без второго фактора.
4. **Резервных копий вне Yandex Cloud нет и восстановление не проверялось.** Если база пропадёт (как у Beget 06.11.2026), заявки и клиенты потеряются.
5. Секреты в коде не найдены, подписи Stripe и Telegram проверяются, чужие заявки/брони по id не открываются — здесь порядок.

## Технические находки

| №   | Серьёзность  | Где (файл:строка)                                                                                                                                                 | Как эксплуатируется                                                                                                                                                                                                                                                                                                                                             | Исправление                                                                                                                                                                                                                                                                    |
| --- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **критично** | `apps/web/package.json` (`next ^14.2.15` → установлен 14.2.35)                                                                                                    | `pnpm audit --prod`: 4 critical, 30 high. В `next`: GHSA-2xp9-vwfh-vxw4, GHSA-2464-fhr4-w9xw, GHSA-p293-qw3h-jr36 — неаутентифицированное RCE (уязвимы все <15.5.24/<15.5.28), плюс SSRF в rewrites/Server Actions, обход middleware (GHSA-36qx-fr4f-26g5), DoS App Router.                                                                                     | Обновить `next` до ≥15.5.28 (React 18.3 совместим; проверить `next-auth` 4.24 и `@serwist/next`). Если нужен 14.x — проверить, есть ли backport 14.2.x в advisories; иначе план перехода на 15 в течение недели. После обновления — `site-check` + `/api/categories`.          |
| 2   | **высоко**   | `apps/web/src/app/api/orders/[id]/route.ts:36,131` и `api/orders/route.ts:53` (`ORDER_INCLUDE.location.addressLine`, lat/lon)                                     | Любой `PROVIDER_ADMIN` (в т.ч. из `POST /api/auth/quick-provider` — только имя и телефон, без проверки) получает точный адрес и координаты заявки любого заказчика до подтверждения брони. Нарушает REVIEW.md §1 («адрес заказчика раньше — ошибка») и 152-ФЗ.                                                                                                  | До `CONFIRMED` отдавать провайдеру только `city` и расстояние от базы (`distanceKm` уже есть), `addressLine`/точные координаты — только владельцу, админу и забронированной компании (`bookedProviderSees`). Добавить тест.                                                    |
| 3   | **высоко**   | `api/orders/[id]/phone/route.ts:40-78`, `lib/chatOrders.ts:11` (`CHAT_PHONE_REVEALS_PER_DAY = 30`)                                                                | Лимит 30 телефонов/сутки считается **на компанию**; регистрация исполнителя открыта и бесплатна, почту подтвердить тривиально → N аккаунтов = N×30 телефонов гостевых и чат-заказчиков в день. Логи `ContactReveal` есть, но тревоги нет.                                                                                                                       | Лимит и на пользователя, и глобально «новым» компаниям (моложе 7 дней / без `ProviderVerification` одобрено) — 3–5 в сутки; телеграм-алерт владельцу при >10 показов за час; показывать телефон только после ставки по этой заявке.                                            |
| 4   | **высоко**   | `lib/rateLimit.ts` (in-memory Map), используется в `api/admin/login:14`, `lib/credentials.ts:36-50`, `api/leads:30`, `api/orders/guest:46`, `api/mobile/login:17` | На Vercel каждая холодная функция имеет свой счётчик: параллельные запросы/распределение по инстансам обнуляют лимит. Админка — один общий пароль (`ADMIN_PASSWORD`), 5 попыток/15 мин только в памяти → подбор реален. Защита по `x-vercel-forwarded-for` корректна, но счётчик не общий.                                                                      | Счётчики в базе (таблица `RateLimit(key, windowStart, count)` с `upsert`, как уже сделано для `prismaRecentLeads` и `ContactReveal`) или Upstash Redis. Для `/admin`: длинный пароль ≥20 симв., журнал попыток в БД, лучше — вход через NextAuth-роль `PLATFORM_ADMIN` + TOTP. |
| 5   | **средне**   | `lib/cronAuth.ts:7-11`, `api/cron/weekly:29-34`, `api/cron/notices` (без секрета вовсе), `api/cron/bot-reminders:113`, `.github/workflows/order-notices.yml:20`   | Без `CRON_SECRET` крон пускает любого с `User-Agent: vercel-cron…`. `/api/cron/notices` и `/connect` публичны по дизайну: чужой вызов запускает рассылку push/Telegram провайдерам (идемпотентно, но раньше срока и за счёт квот Resend/Expo); лимит по IP — в памяти (см. №4).                                                                                 | Убедиться, что `CRON_SECRET` задан в Vercel **и** в GitHub Secrets; в `cronAllowed` убрать fallback по User-Agent (403, если секрета нет); `order-notices.yml` слать `Authorization: Bearer`; `notices`/`bot-reminders` требовать секрет всегда.                               |
| 6   | **средне**   | `api/leads/route.ts:55`, `api/ai/agents/route.ts:132`, `lib/email.ts:93-98`                                                                                       | При сбое БД в лог Vercel пишется полный JSON лида (имя, телефон, текст), при ошибке письма — адреса получателей. Логи Vercel — сторонний хранитель ПДн без согласия.                                                                                                                                                                                            | Логировать `maskPhone()` (есть в `lib/chatOrders.ts`) и хэш; полный лид — во второй канал (Telegram владельцу уже уходит) или отдельную таблицу-очередь.                                                                                                                       |
| 7   | **средне**   | `lib/integrations.ts:7-16`, `lib/admin.ts:12`, `lib/mobileAuth.ts:30`                                                                                             | Один `NEXTAUTH_SECRET` порождает: веб-сессии, мобильные JWT (30 дней, без refresh), cookie админки, секреты вебхуков Telegram/WhatsApp/inbound, HMAC отписки и продления. Утечка одного значения = компрометация всего; ротация разлогинивает всех и ломает вебхук Telegram до следующего `/connect` (раз в час).                                               | Отдельные переменные `TELEGRAM_WEBHOOK_SECRET`, `INBOUND_API_TOKEN`, `MOBILE_JWT_SECRET` (с fallback на derive для совместимости). Мобильный JWT: TTL 7 дней + «тихое» переподписание в `/api/mobile/me`.                                                                      |
| 8   | **средне**   | `apps/web/next.config.mjs:797-805`                                                                                                                                | Нет `Strict-Transport-Security` в коде (Vercel ставит HSTS на своих доменах — проверить ответ `curl -I https://иистройка24.рф`), нет script-CSP (сознательно, из-за Метрики). `X-Frame-Options` заменён `frame-ancestors` — ок. Cookie: `sp16_admin` httpOnly/lax/secure — ок; NextAuth — свои флаги; CSRF: JSON-API + SameSite=Lax + CSRF-токен NextAuth — ок. | Добавить `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` явно; CSP в режиме `Content-Security-Policy-Report-Only` с `script-src 'self' 'nonce-…' https://mc.yandex.ru` для накопления отчётов.                                                       |
| 9   | **низко**    | `api/files/[...key]/route.ts`, `lib/fileStore.ts:24`, `api/photos/route.ts`                                                                                       | Файлы в БД: ключ 72 бита случайности, whitelist типов, `sandbox` CSP, PDF как attachment, лимиты 200 МБ/папка и 2 ГБ всего — хорошо. `private/` закрыт через `canReadPrivateFile`. Риск: анонимный `/api/photos` (3×5 МБ, лимит в памяти) — набивание Vercel Blob; `StoredFile` раздувает БД (одна таблица 2 ГБ в Yandex MDB дорого бэкапить).                  | Для `/api/photos` — лимит по IP в БД или капча; cron, удаляющий `StoredFile` без ссылок из `Equipment.imageUrls`/`ProviderDocument`.                                                                                                                                           |
| 10  | **низко**    | `api/integrations/telegram/connect/route.ts:38-44`                                                                                                                | Публичный GET возвращает `previous` webhook URL, имя бота и Mini App — мелкая утечка конфигурации.                                                                                                                                                                                                                                                              | Отвечать только `{ ok, already }`.                                                                                                                                                                                                                                             |
| 11  | ок           | `middleware.ts`, `login/page.tsx:14-25`, `r/[code]/route.ts`, `api/unsubscribe GET`, `verify-email GET`                                                           | Редиректы только на фиксированный домен/свой origin; open redirect не найден.                                                                                                                                                                                                                                                                                   | —                                                                                                                                                                                                                                                                              |
| 12  | ок           | `api/stripe/webhook:1243`, `api/integrations/telegram:840`, `whatsapp:579`, `inbound:529`                                                                         | Подпись Stripe, `x-telegram-bot-api-secret-token`, Bearer с `timingSafeEqual` — проверяются.                                                                                                                                                                                                                                                                    | —                                                                                                                                                                                                                                                                              |
| 13  | ок           | `bookings/[id]`, `bids/[id]/accept`, `equipment/[id]`, `operators/[id]`, `timesheets/[id]`, `shifts/[id]`, `documents/[id]`, `threads/*`                          | Везде проверка владельца/компании, 404 чужим. Все 29 `api/admin/*` — `isAdminRequest()`.                                                                                                                                                                                                                                                                        | —                                                                                                                                                                                                                                                                              |
| 14  | ок           | Секреты                                                                                                                                                           | Grep по `sk_live`, `whsec_`, `re_`, токенам бота, AWS, приватным ключам, `postgres://user:pass@` — только тестовые фикстуры. `.env.example` пуст. `NEXT_PUBLIC_*` — только URL, имя бота, номер Метрики. Телефон/ИНН/адрес в `lib/site.ts` — публичные реквизиты оператора ПДн (нужны для /privacy).                                                            | —                                                                                                                                                                                                                                                                              |
| 15  | ок (152-ФЗ)  | `lib/orderBoard.ts:272-322`, `components/OrderPublicView.tsx`, `orders/[id]/opengraph-image.tsx`, `lib/channelDigest.ts`, `lib/ingest.ts:141`                     | Доска, карточка гостя, OG-превью, канал: имя «Анна П.», город, дата; описание через `maskContactsAndLinks`; телефон в `contactPhone` отдельно. Карта `/api/providers/map` — без контактов.                                                                                                                                                                      | —                                                                                                                                                                                                                                                                              |

## 9. Резервные копии базы

- **Где**: база — Yandex Managed PostgreSQL (`packages/database/src/connection.ts`). Автоматические бэкапы Yandex MDB включены по умолчанию (ежедневно, хранение 7 дней), живут **в том же облаке и аккаунте**. Vercel Blob (фото) и файлы в `StoredFile` отдельно не копируются. В репозитории нет ни документации о бэкапах, ни скрипта (`grep -ri backup docs/ tasks/` — пусто), восстановление **не проверялось**.
- **Риск**: потеря аккаунта/оплаты Yandex, удаление кластера оператором, ошибочный `prisma db push` (миграций нет, откат невозможен) — заявки, лиды, пользователи теряются без следа.
- **Сделать**: (а) в консоли Yandex MDB увеличить хранение бэкапов до 14–30 дней и один раз **восстановить в новый кластер**, проверив `SELECT count(*) FROM "Order"`; (б) еженедельный GitHub Actions `pg_dump -Fc` (шаблон уже есть в `.github/workflows/migrate-db-to-yandex.yml`) с шифрованием `age`/`gpg` и выгрузкой в **другого** провайдера (Yandex Object Storage другого аккаунта, Backblaze B2 или хотя бы Google Drive владельца); (в) записать процедуру восстановления в `docs/ops.md`; (г) `vercel blob` — раз в месяц выгружать список/файлы `photos/` тем же workflow.

## 10. Секреты и ротация (значения не приводятся)

| Секрет                                                     | Где задан                                                                                         | Как ротировать                                                                                                                                                                                                                                               |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL` / `DIRECT_URL`                              | Vercel → Environment Variables; GitHub Secrets (`SOURCE_/TARGET_DATABASE_URL` для переноса)       | Yandex MDB → Пользователи → сменить пароль `specai`; обновить обе переменные в Vercel, Redeploy; удалить устаревшие GitHub Secrets переноса.                                                                                                                 |
| `NEXTAUTH_SECRET`                                          | Vercel                                                                                            | `openssl rand -base64 32` → Vercel → Redeploy. Разлогинит всех (веб и приложение), сменит cookie админки и секреты вебхуков: после деплоя открыть `/api/integrations/telegram/connect` (переустановит вебхук) и переписать токены Green API/n8n из `/admin`. |
| `ADMIN_PASSWORD`                                           | Vercel                                                                                            | Новый пароль ≥20 символов → Vercel → Redeploy; старые cookie и токены приложения перестают работать сразу.                                                                                                                                                   |
| `TELEGRAM_BOT_TOKEN`                                       | Vercel (+ бот указан в `NEXT_PUBLIC_TELEGRAM_BOT`)                                                | @BotFather → /revoke → новый токен → Vercel → Redeploy → `/api/integrations/telegram/connect`. Проверить, что в группах бот остался админом.                                                                                                                 |
| `TELEGRAM_CHAT_ID`, `TELEGRAM_CHANNEL_ID`                  | Vercel                                                                                            | Не секреты, но при смене чата владельца обновить.                                                                                                                                                                                                            |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`               | Vercel (онлайн-оплата выключена, `ONLINE_PAYMENTS`)                                               | Dashboard Stripe → API keys → Roll key; Webhooks → endpoint → Roll secret → Vercel → Redeploy. Пока оплата выключена — можно удалить из Vercel вовсе.                                                                                                        |
| `RESEND_API_KEY`, `EMAIL_FROM`                             | Vercel                                                                                            | resend.com → API Keys → Create new, удалить старый → Vercel → Redeploy.                                                                                                                                                                                      |
| `CRON_SECRET`                                              | Vercel **и** GitHub → Settings → Secrets → Actions                                                | Случайная строка 32+ символов в оба места одновременно; Vercel сам шлёт её в `Authorization` для `vercel.json` cron.                                                                                                                                         |
| `BLOB_READ_WRITE_TOKEN`                                    | Vercel Storage → Blob                                                                             | Storage → Blob → Tokens → Revoke + Create; Redeploy.                                                                                                                                                                                                         |
| `ANTHROPIC_API_KEY`                                        | Vercel                                                                                            | console.anthropic.com → API Keys → создать новый, удалить старый; Redeploy. Поставить лимит расходов.                                                                                                                                                        |
| `EXPO_TOKEN` / `EXPO_ACCESS_TOKEN`                         | Cloud-окружение сессий Claude; Vercel (push)                                                      | expo.dev → Access tokens → Revoke/Create; обновить в окружении сессий и Vercel.                                                                                                                                                                              |
| `GREEN_API_*`, `SMSRU_API_ID`                              | Vercel (пока пустые)                                                                              | В кабинетах Green API / SMS.ru пересоздать токен → Vercel → Redeploy.                                                                                                                                                                                        |
| Yandex Cloud (аккаунт, сервисные ключи, `yandex-root.crt`) | Консоль Yandex Cloud; CA-сертификат в коде (`packages/database/src/certs`) — публичный, не секрет | Включить 2FA на аккаунте Yandex ID владельца; сервисных ключей в репозитории нет.                                                                                                                                                                            |
| `INDEXNOW_KEY`                                             | Vercel или файл в `public/`                                                                       | Не секрет (по протоколу публичен).                                                                                                                                                                                                                           |

Правило: после каждой ротации — Redeploy и проверка `/api/health` (200, флаги интеграций `true`) и `/api/categories`.

## Порядок работ (предложение)

1. Обновить Next.js (№1) — 1 день.
2. Скрыть адрес до подтверждения и ужесточить показ телефонов (№2, №3) — 1 день, с тестами.
3. Лимиты в БД + `CRON_SECRET` везде (№4, №5) — 1 день.
4. Бэкап вне Yandex + тест восстановления (§9) — полдня.
5. Разделить секреты, HSTS, маскировать логи (№6–8) — по ходу.

## Обновление Next.js (проверка 2026-11-08, решение за владельцем)

**Патча для 14.x нет.** `npm view next versions`: последняя ветка 14 — `14.2.35`
(она и установлена). Все три критических advisory закрыты только в 15.5:

| Advisory            | Суть                                                                                  | Уязвимо          | Исправлено |
| ------------------- | ------------------------------------------------------------------------------------- | ---------------- | ---------- |
| GHSA-2xp9-vwfh-vxw4 | RCE через `libheif` в `sharp` при оптимизации AVIF (Image Optimization API)           | ≥10.0.0 <15.5.24 | ≥15.5.24   |
| GHSA-2464-fhr4-w9xw | RCE через библиотеку оптимизации изображений на glibc-Linux (обход: `sharp` ≥ 0.35.5) | ≥10.0.0 ≤15.5.27 | ≥15.5.28   |
| GHSA-p293-qw3h-jr36 | RCE на серверах с файловой системой Windows                                           | ≥13.4.0 <15.5.24 | ≥15.5.24   |

Плюс 30 «high» (DoS Server Components/Server Actions, SSRF в rewrites и Server
Actions на кастомных серверах, обход middleware с i18n в Pages Router, cache
poisoning) — все исправлены в 15.5.16–15.5.28. Текущая стабильная ветка 15 —
`15.5.29`; `latest` на npm уже `16.4.5`.

**Что это значит для нас сейчас (смягчающие факторы, не замена обновлению):**

- `sharp` в `pnpm-lock.yaml` отсутствует вовсе; на Vercel оптимизацию
  `next/image` выполняет инфраструктура Vercel, а не `sharp` в нашей функции.
  Два RCE в Image Optimization API бьют по self-hosted серверам; сервер
  Windows (третий RCE) у нас не используется. Это снижает, но не снимает риск:
  advisories по DoS/SSRF/cache poisoning применимы к App Router на Vercel.
- `images` в `next.config.mjs` не настроен (пять компонентов с `<Image>`,
  удалённых `remotePatterns` нет).

**Что потребует переход на 15.5.x (оценка по коду `apps/web`):**

1. **Async request APIs** (главное ломающее изменение App Router): `params`,
   `searchParams`, `cookies()`, `headers()`, `draftMode()` стали промисами.
   У нас 74 файла `page.tsx`/`layout.tsx`/`route.ts`/`opengraph-image.tsx`
   читают `params`/`searchParams`, 3 файла вызывают `cookies()`, 2 — `headers()`.
   Codemod `npx @next/codemod@canary next-async-request-api` делает основную
   часть автоматически, но каждую сигнатуру нужно проверить (116 route
   handlers с `{ params }`).
2. **Кэширование по умолчанию**: `fetch` и GET route handlers больше не
   кэшируются. У нас 103 файла с `export const dynamic = 'force-dynamic'`
   (большинство станет лишним, но не вредит) и 6 `export const revalidate`
   (погода, каталог) — их поведение сохраняется, проверить.
   `fetchCache = 'default-no-store'` в `api/orders` и `force-no-store` в cron —
   оставить.
3. **React 19**: App Router в Next 15 работает на React 19 — обновить
   `react`, `react-dom` до 19.x и `@types/react`/`@types/react-dom` до 19
   (сейчас 18.3). `next-auth@4.24` объявляет peer `react ^17||^18||^19` и
   `next ^12.2.5||^13||^14||^15||^16` — совместим без перехода на Auth.js v5.
   `@serwist/next@9` — peer `next >=14`, `react >=18` — совместим. `@prisma/nextjs-monorepo-workaround-plugin`
   остаётся (CLAUDE.md п. 7); на Next 15 проверить, что `experimental.outputFileTracingIncludes`
   переехал в корень конфига (`outputFileTracingIncludes`, в 15 он стабилен).
4. **`middleware.ts`** (`src/middleware.ts`) — API не менялся в 15.5, но
   проверить матчер и редиректы (`login`, `/admin`) после обновления.
5. **Lint**: `next lint` в 15 устарел, `eslint-config-next` обновить до 15.x;
   ESLint 9 с flat config — отдельная задача, можно отложить.
6. **Сборка и проверка**: `pnpm install`, `cd apps/web && npx next build` с
   пустыми `DATABASE_URL`/`DIRECT_URL`, `pnpm lint && pnpm typecheck && pnpm test`,
   Playwright (`e2e/playwright.config.ts`), `/site-check`; после деплоя —
   `https://spec-ai-web.vercel.app/api/categories` → 200 и Vercel → Logs
   (Prisma engine, CLAUDE.md п. 7). Мобильное приложение API-совместимо, его
   трогать не нужно.

Оценка: 1 рабочий день одной сессии (codemod + ручная проверка сигнатур +
прогон e2e), в отдельной ветке с превью Vercel; слияние — после `site-check`
и проверки входа/админки/подачи заявки на превью. Next 16 (`latest`) не
рассматривать до стабилизации экосистемы (Serwist, next-auth v4).

## Что исправлено в этой ветке (2026-11-08)

- №2 — адрес заявки исполнителю: `lib/orderLocationPrivacy.ts`, `GET /api/orders`,
  `GET /api/orders/[id]`: до CONFIRMED — только `city` и `distanceKm`.
- №3 — показ телефонов: лимит на сотрудника (15/сутки), 5/сутки новым (<7 дней)
  и непроверенным компаниям, тревога владельцу в Telegram при >10 показов/час.
- №4 — лимиты входа, `/api/leads`, `/api/ai/agents`, `/api/admin/login` считаются
  и в базе (`RateLimitWindow`, `lib/durableRateLimit.ts`); память — первый слой.
- №5 — `/api/cron/*` требуют `CRON_SECRET` (без fallback по User-Agent);
  workflows `order-notices`, `bot-reminders` шлют секрет из GitHub Secrets.
  **Владелец: задать `CRON_SECRET` в Vercel и в GitHub → Settings → Secrets →
  Actions — одинаковое значение; без него кроны отвечают 403.**
- №6 — при сбое базы лид не пишется в лог целиком.
- №1 — см. раздел выше; решение за владельцем.
