# СпецПласт16 (SpecAI)

Сайт аренды спецтехники **СпецПласт16** с командой ИИ-агентов. Название, телефон,
email и город задаются в `apps/web/src/lib/site.ts`.

AI platform for heavy equipment rental and construction services.

## Overview

SpecAI is a marketplace that connects construction companies with heavy equipment
providers (excavators, cranes, bulldozers, etc.), layered with AI features:

- **Equipment recommendation** — describe a job and get ranked equipment matches
  from available inventory, with a rationale for each pick.
- **Spec extraction** — paste a manufacturer spec sheet or listing description and
  get structured make/model/year/technical specs back.
- **Support assistant** — a conversational assistant for booking and policy questions.

## Repository structure

Monorepo managed with pnpm workspaces:

```
apps/
  web/                Next.js 14 (App Router) app — customer-facing site + API routes
packages/
  database/           Prisma schema and client (Postgres)
  shared/             Zod schemas/types shared between the app and API boundaries
  ui/                 Shared React components (Tailwind-based)
  ai-service/         Anthropic-backed AI features (recommendation, spec extraction, chat)
```

### Domain model (`packages/database/prisma/schema.prisma`)

- `User` / `Company` / `Location` — identity and org structure. A `Company` can be
  an equipment provider (`isProvider`), a customer org, or both.
- `EquipmentCategory` / `Equipment` / `MaintenanceRecord` — the fleet catalog.
  `Equipment.specs` is a free-form JSON field populated manually or via AI spec
  extraction, since technical specs vary widely across equipment types.
- `Booking` / `Document` / `Review` — the rental lifecycle: booking a piece of
  equipment for a date range, attaching contracts/insurance/inspection docs, and
  reviewing after completion.
- `AiConversation` / `AiMessage` — persisted history for AI assistant interactions.

## Getting started

Requires Node 20+ and pnpm.

```bash
cp .env.example .env      # set DATABASE_URL, DIRECT_URL, ANTHROPIC_API_KEY, NEXTAUTH_SECRET
docker compose up -d      # local Postgres
pnpm install
pnpm db:generate
pnpm db:push               # sync schema to the database
pnpm db:seed                # optional: sample companies/equipment/users
pnpm dev                   # runs apps/web on http://localhost:3000
```

Seeded accounts (see `packages/database/prisma/seed.ts`):

- Provider admin: `provider@example.com` / `provider123`
- Customer: `customer@example.com` / `customer123`

## Deploying to a public URL

The commands above only run the app on `localhost`. To get a URL reachable from
any device — phone, another computer, anywhere — deploy to a host with a public
address. The stack (Next.js + Postgres) maps cleanly onto **Vercel** (app) +
**Neon** (Postgres), both of which have a free tier and need no server management.

1. **Database** — create a free project at [neon.tech](https://neon.tech) (or
   Supabase, or any managed Postgres). Neon gives you two connection strings:
   a **pooled** one (hostname contains `-pooler`) and a **direct** one (same
   hostname without `-pooler`). You need both — see step 2.
2. **App** — go to [vercel.com](https://vercel.com), "Add New Project", import
   this GitHub repo.
   - Framework preset: Next.js (auto-detected).
   - **Root Directory**: set to `apps/web` (this is a monorepo — Vercel needs
     to know the Next.js app isn't at the repo root).
   - Environment variables: `DATABASE_URL` (the **pooled** Neon string — used
     at runtime), `DIRECT_URL` (the **direct**, unpooled Neon string — used
     for `prisma db push`; DDL over a transaction-mode pooler is unreliable),
     `NEXTAUTH_SECRET` (any random string — `openssl rand -base64 32`),
     `NEXTAUTH_URL` (your Vercel deployment URL, e.g.
     `https://your-app.vercel.app`), and `ANTHROPIC_API_KEY` if you want the
     AI features live.
3. Deploy. `apps/web`'s `build` script (`pnpm --filter @specai/database push
&& pnpm --filter @specai/database ensure-categories && next build`) syncs
   the Prisma schema to whatever `DATABASE_URL` points at and seeds the base
   equipment categories on every build — no separate manual step, and safe to
   re-run since both are idempotent. It deliberately does **not** run the full
   `prisma/seed.ts` (fake companies, hardcoded `provider123`/`customer123`
   passwords) against a real deployment — that script is for local dev only.
   Register real accounts via `/register` on the deployed site instead.

After that, the Vercel URL works from any device on any network — no tunnel,
no local server required.

## Scripts

Run from the repo root:

- `pnpm dev` — start the web app in development mode
- `pnpm build` — build all packages and the web app
- `pnpm lint` — lint the whole workspace
- `pnpm typecheck` — typecheck all packages
- `pnpm test` — run unit tests (vitest) in every package that has them
- `pnpm db:generate` / `pnpm db:push` / `pnpm db:studio` / `pnpm db:seed` — Prisma workflows

## Application features implemented so far

- **Auth** — email/password via NextAuth (JWT sessions). `/register` supports both
  account types: renting customers, and providers (creates a `Company` with
  `isProvider: true` and a `PROVIDER_ADMIN` user in one transaction). `/dashboard`
  and `/provider` are auth-gated by `apps/web/src/middleware.ts`.
- **Equipment catalog** — `/equipment` listing with a filter form (category, city,
  price range, text search) and `/equipment/[id]` detail pages, including average
  rating and reviews; `GET/POST /api/equipment` for search and (provider-only)
  listing.
- **Bookings** — `POST /api/bookings` validates date ranges, rejects overlapping
  bookings for the same equipment, and computes the total price server-side; the
  equipment detail page includes a booking form for signed-in customers, and
  `/dashboard` lists the current user's bookings. `PATCH /api/bookings/[id]` drives
  the booking state machine (provider confirms/activates/completes/cancels,
  customer can cancel a pending/confirmed booking).
- **Provider dashboard** — `/provider` lists a provider's equipment and incoming
  bookings with approve/cancel/complete actions, and a form to list new equipment,
  including an AI-assisted "paste a spec sheet" flow.
- **Reviews** — after a booking is `COMPLETED`, the customer can leave a rating and
  comment (`POST /api/reviews`), shown on the equipment detail page.
- **AI recommendation** — `/recommend` page and `POST /api/ai/recommend` rank
  available equipment against a free-text job description using Claude tool calls.
- **Dispatch (orders & bids)** — `/orders` lets a customer post a job request
  (what's needed, category, date range) without picking a specific listing up
  front — a taxi-style counterpart to browsing the catalog. Providers browse
  open orders and submit a `Bid` (their equipment + price) via
  `POST /api/orders/[id]/bids`; the customer accepts one via
  `POST /api/bids/[id]/accept`, which atomically creates a `Booking`, marks
  the order `MATCHED`, and rejects the other bids.

## Запуск сайта: что настроить владельцу

Все настройки — в Vercel → проект → Settings → Environment Variables (для Production и
Preview), после изменения — Deployments → Redeploy.

| Переменная                                        | Зачем                                                          | Обязательно             |
| ------------------------------------------------- | -------------------------------------------------------------- | ----------------------- |
| `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` | база данных и вход                                             | да                      |
| `ANTHROPIC_API_KEY`                               | полноценные ИИ-агенты (без ключа работают в упрощённом режиме) | желательно              |
| `ADMIN_PASSWORD`                                  | пароль к `/admin` — там заявки на звонок                       | да, чтобы видеть заявки |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`          | уведомления о новых заявках в Telegram                         | нет                     |
| `NEXT_PUBLIC_SITE_URL`                            | адрес сайта для sitemap и превью в соцсетях                    | когда будет домен       |
| `NEXT_PUBLIC_YANDEX_METRIKA_ID`                   | счётчик Яндекс.Метрики для статистики посещений                | нет                     |

Реквизиты оператора персональных данных (ИП/ООО, ИНН) для политики конфиденциальности —
в `apps/web/src/lib/site.ts` (`legalName`, `inn`).

## Перенос базы в Yandex Cloud (152-ФЗ)

Код уже умеет работать с Yandex Managed Service for PostgreSQL: для хостов
`*.mdb.yandexcloud.net` соединение шифруется и проверяется по корневому сертификату
Yandex (скачивается при сборке, `packages/database/src/connection.ts`).

1. **Создать кластер** — console.yandex.cloud → Managed Service for PostgreSQL →
   «Создать кластер»: PostgreSQL 17, класс s3-c2-m8 или меньше (для старта хватит
   b2.medium), диск 10–20 ГБ, **«Публичный доступ» у хоста — включить**, база
   `specai`, пользователь `specai` с паролем. В настройках пользователя режим пулинга —
   **«Сессионный»**.
2. **Открыть доступ** — в группе безопасности кластера разрешить входящий TCP 6432 из
   0.0.0.0/0 (у Vercel и GitHub нет постоянных IP).
3. **Скопировать данные** — GitHub → Settings → Secrets and variables → Actions → New
   secret:
   - `SOURCE_DATABASE_URL` — текущая база: значение `DIRECT_URL` из Vercel (если его нет —
     `DATABASE_URL`, но без `-pooler` в адресе);
   - `TARGET_DATABASE_URL` —
     `postgresql://specai:ПАРОЛЬ@ХОСТ.mdb.yandexcloud.net:6432/specai` (хост — на
     странице кластера, вкладка «Хосты»).

   Затем Actions → «Перенос базы в Yandex Cloud» → Run workflow → ввести `ПЕРЕНЕСТИ`.
   Задача копирует все таблицы и сверяет число строк; в непустую базу копировать
   откажется.

4. **Переключить сайт** — в Vercel заменить `DATABASE_URL` и `DIRECT_URL` на адрес Yandex
   (тот же, что `TARGET_DATABASE_URL`) → Redeploy.
5. **Ускорить** — Vercel → Settings → Functions → Function Region → Frankfurt (fra1),
   ближайший к Москве регион.
6. Проверить сайт и через пару недель удалить старую базу.

## Парк СпецПласт16 в каталоге

`packages/database/prisma/ensure-fleet.ts` при каждой сборке добавляет в каталог технику
компании (ООО «СПЕЦПЛАСТ 16», Набережные Челны) с ценами за машино-час; смена = 8 ч.
Скрипт ничего не перезаписывает, поэтому изменения из кабинета поставщика сохраняются.
Чтобы управлять парком: зарегистрируйтесь на сайте → `/admin` → «Сделать управляющим
парком» → выйдите и войдите снова → раздел «Поставщикам».

## Заявки из Telegram и WhatsApp → на торги

Сообщения из групп и чатов автоматически разбираются (`packages/shared/src/messageParser.ts`,
с ключом ИИ — `packages/ai-service/src/chatRequest.ts`): запросы техники становятся
заявками на `/orders`, где поставщики делают ставки; реклама поставщиков и болтовня
отсекаются, повторы и репосты в разных группах склеиваются. Уверенные заявки публикуются
сразу, сомнительные ждут модерации в `/admin`. Контакты автора видны только
поставщикам, владельцу приходит уведомление в Telegram.

- **Telegram** — бот (`TELEGRAM_BOT_TOKEN`) → `/admin` → «Подключить Telegram-бота» →
  у @BotFather `/setprivacy` → Disable → добавить бота в группы.
  `TELEGRAM_CHAT_ID` для уведомлений: написать боту `/id` (в личке или в рабочей группе) —
  он ответит номером чата.
- **WhatsApp** — через шлюз Green API (официального API для групп нет): URL и токен
  вебхука — в `/admin`.
- **Любой другой источник** — `POST /api/integrations/inbound` с токеном из `/admin`.

## Заявки на звонок

Форма «Заявка на звонок» есть на главной, в контактах, на странице поставщиков и в
карточке каждой техники. Заявки сохраняются в базе (`Lead`), видны в `/admin` (вход по
`ADMIN_PASSWORD`, статусы «Новая / В работе / Обработана») и, если настроен бот, приходят
в Telegram. Форма требует согласия на обработку персональных данных (152-ФЗ), защищена
от ботов (скрытое поле) и от флуда (лимит по IP).

## ИИ-агенты (`/agents` + чат-виджет на каждой странице)

`POST /api/ai/agents` принимает `{ agentId, messages }` и запускает агента с
инструментами, которые работают с живой базой данных (`packages/ai-service/src/agents.ts`,
обработчики инструментов — `apps/web/src/app/api/ai/agents/route.ts`):

- **Консультант** — поиск техники в каталоге, характеристики, расчёт стоимости аренды.
- **Диспетчер** — собирает детали работ и после подтверждения клиента создаёт заявку.
- **Поддержка** — статус бронирований и заявок текущего пользователя, условия аренды.
- **Помощник поставщика** — открытые заявки и состояние парка техники поставщика.
- **Авто** (`agentId: "auto"`) — роутер сам выбирает подходящего агента.

С `ANTHROPIC_API_KEY` агенты работают через Claude. Без ключа (или при сбое ИИ) они
отвечают в упрощённом режиме: ищут технику в каталоге по ключевым словам, показывают
бронирования и заявки пользователя и предлагают оставить заявку на звонок.

## Анимации

- Звуки (`apps/web/src/lib/machineSounds.ts`) синтезируются через Web Audio API, без
  аудиофайлов: гул мотора по газу, «бип-бип» при клике, «боинг» при появлении, звуки
  эмоций, храп, щелчок фар, шорох грунта. Играют только после первого клика/касания
  (требование браузеров), кнопка «Звук вкл/выкл» запоминает выбор.
- 3D-наклон карточек (`TiltCard`), появление блоков при прокрутке (`Reveal`),
  вращающийся 3D-куб и анимированный фон — стили в `apps/web/src/app/globals.css`.

## File uploads (Vercel Blob)

Providers can attach photos (JPEG/PNG/WebP) and PDF spec sheets to new equipment.
Files go to [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) via
`POST /api/uploads` (multipart, field `file`, max 10 MB, public URL with a random
suffix). Image URLs are stored in `Equipment.imageUrls` and shown in the catalog and
on the equipment page; any uploaded file can be passed to
`POST /api/ai/extract-specs` as `{ fileUrl }` to extract specs with Claude vision.

Setup: in the Vercel dashboard open your project → **Storage** → create a **Blob**
store and connect it (this adds `BLOB_READ_WRITE_TOKEN`); locally copy the token into
`.env`. Without the token the upload endpoint returns `503 Хранилище не настроено`
and the rest of the app keeps working.

## Payments (Stripe)

Customers pay for a `PENDING` or `CONFIRMED` booking (with `depositPaid = false`)
with Stripe Checkout from `/dashboard` ("Оплатить"). `POST /api/bookings/[id]/checkout`
creates a `Payment` row and a Checkout Session and returns its `url`;
`POST /api/stripe/webhook` verifies the Stripe signature and, on
`checkout.session.completed`, marks the payment `PAID`, sets
`Booking.depositPaid = true` and moves a `PENDING` booking to `CONFIRMED` (an
already confirmed booking keeps its status). Expired sessions and
`checkout.session.async_payment_failed` mark the payment `FAILED`;
`payment_intent.payment_failed` is only logged, because the customer can retry
in the same session. Refunds are done manually in the Stripe Dashboard: when a
booking with a `PAID` payment is cancelled, `Payment.refundRequired` is set
to flag it. The Stripe client is created lazily,
so the app builds and runs without these variables — only payments are disabled.

Environment variables (see `.env.example`):

- `STRIPE_SECRET_KEY` — secret API key (`sk_test_...` for test mode).
- `STRIPE_WEBHOOK_SECRET` — signing secret of the webhook endpoint (`whsec_...`).
- `NEXT_PUBLIC_APP_URL` — public base URL for Checkout success/cancel redirects
  (falls back to `NEXTAUTH_URL`).

Local webhook setup with the [Stripe CLI](https://docs.stripe.com/stripe-cli):

```bash
stripe login
stripe listen --forward-to localhost:3000/api/stripe/webhook
# copy the printed "whsec_..." into STRIPE_WEBHOOK_SECRET and restart `pnpm dev`
stripe trigger checkout.session.completed   # optional smoke test
```

In production, add an endpoint in the Stripe Dashboard pointing at
`https://<your-domain>/api/stripe/webhook` with the events
`checkout.session.completed`, `checkout.session.async_payment_succeeded`,
`checkout.session.async_payment_failed`, `checkout.session.expired` and
`payment_intent.payment_failed`, and use its signing secret.

## Email notifications (Resend)

Key events trigger transactional emails via [Resend](https://resend.com). Templates
live in `apps/web/src/lib/emailTemplates.ts` (plain HTML + text, in Russian); the
client in `apps/web/src/lib/email.ts` is created lazily and every send is wrapped in
`try/catch`, so a failed or unconfigured email never breaks the API request — it is
only logged (`[email] skipped: ...` / `[email] send failed`).

| Event                                              | Recipient                             | Template               |
| -------------------------------------------------- | ------------------------------------- | ---------------------- |
| `POST /api/orders/[id]/bids` — new bid on an order | order customer                        | `newBidReceived`       |
| `POST /api/bids/[id]/accept` — bid accepted        | `PROVIDER_ADMIN` users of the company | `bidAccepted`          |
| `PATCH /api/bookings/[id]` — status changed        | booking customer                      | `bookingStatusChanged` |
| Stripe webhook — payment marked `PAID`             | customer and provider admins          | `paymentReceived`      |

Environment variables (see `.env.example`):

- `RESEND_API_KEY` — API key from the Resend dashboard. When missing, sending is
  skipped and the app keeps working.
- `EMAIL_FROM` — sender on a domain verified in Resend, e.g. `SpecAI <noreply@example.com>`
  (`onboarding@resend.dev` works for testing).
- Links in emails use `NEXT_PUBLIC_APP_URL` (falls back to `NEXTAUTH_URL`).

Tests: `pnpm --filter @specai/web test` covers the templates and the no-key path.

## Password reset and email verification

One-time tokens live in the `VerificationToken` table (`type` is `PASSWORD_RESET` or
`EMAIL_VERIFY`). Only the sha256 hash of a token is stored; the raw value exists solely in
the emailed link. Consuming a token is a single atomic `updateMany` (unused + not expired →
`usedAt = now`), so a link works exactly once. Helpers: `apps/web/src/lib/tokens.ts`.

- `POST /api/auth/forgot-password { email }` — always `200`; if the account exists, sends
  `passwordReset` with `/reset-password?token=…` (valid 60 min). Rate limited 5/hour per
  email + IP.
- `POST /api/auth/reset-password { token, password }` — sets a new bcrypt hash; `400`
  "Ссылка недействительна или устарела" for an unknown, used or expired token.
- `POST /api/auth/send-verification` — session required; no-op when already verified;
  sends `emailVerify` with `/verify-email?token=…` (valid 24 h). Registration sends the
  same email best-effort.
- `GET /verify-email?token=…` → `/api/auth/verify-email` — marks `User.emailVerified` and
  redirects to `/dashboard?verified=1` (or `/login?verified=1` without a session).

Pages: `/forgot-password`, `/reset-password`; `/login` links to the former, and the dashboard
shows a "Подтвердите email" banner (`VerifyEmailBanner`) until the address is verified.

## PWA

Сайт устанавливается как приложение (Progressive Web App): манифест генерируется в
`apps/web/src/app/manifest.ts`, иконки лежат в `apps/web/public/icons` (пересоздать:
`pnpm --filter @specai/web icons`, нужен Python 3 + Pillow), service worker собирается из
`apps/web/src/app/sw.ts` через `@serwist/next` в `apps/web/public/sw.js` (файл генерируется при
`next build`, в git не попадает; в `next dev` service worker отключён).

### Установка

- **iPhone / iPad (Safari):** откройте сайт → кнопка «Поделиться» → «На экран „Домой“» → «Добавить».
  Сайт сам покажет подсказку внизу экрана; её можно закрыть — напоминание вернётся через 7 дней.
- **Android (Chrome и др.):** нажмите «Установить» на плашке «Установить приложение» внизу экрана
  либо меню браузера → «Установить приложение» / «Добавить на главный экран».
- **Desktop (Chrome / Edge):** иконка установки в адресной строке.

### Что кэшируется

- **Precache (app shell):** статика Next.js (`/_next/static/**`), файлы из `public/` (иконки) и
  офлайн-страница `/~offline`.
- **Runtime, cache-first:** `/icons/**`, `/_next/static/**`, `/_next/image`, картинки и шрифты.
- **Runtime, network-first (до суток):** публичные страницы (`/`, `/equipment`, `/recommend` и т.п.)
  и их RSC-ответы — открываются офлайн, если были посещены.
- **Не кэшируется никогда:** `/api/**` (включая `/api/auth/**`) и страницы, зависящие от сессии:
  `/dashboard`, `/orders`, `/provider`, `/login`, `/register`, `/forgot-password`,
  `/reset-password`, `/verify-email`.
- Если сеть недоступна и страницы нет в кэше, показывается `/~offline` («Нет соединения»);
  при появлении сети приложение перезагружается автоматически.

## AI service usage

`packages/ai-service` exposes three functions consumed by `apps/web`:

- `recommendEquipment(jobDescription, candidates)` — tool-call based ranking of
  candidate equipment against a natural-language job description.
- `extractEquipmentSpecs(sourceText)` — structured spec extraction from free text.
- `extractEquipmentSpecsFromFile({ data, mediaType })` — the same extraction from a
  base64 photo (JPEG/PNG/WebP, sent as an `image` block) or PDF (`document` block).
- `replyToCustomer(history)` — a support chat turn given conversation history.

All three require `ANTHROPIC_API_KEY` to be set.
