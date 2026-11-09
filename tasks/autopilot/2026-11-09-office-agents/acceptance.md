# Приёмка по требованиям (2026-11-09)

Проверки ветки: `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test` (2012 тестов в
apps/web, из них 146 в `lib/office/**`) — зелёные; `next build` с фиктивной базой — успешно;
`/code-review high` — 10 подтверждённых замечаний исправлены с тестами (коммит «исправления по
код-ревью»); `git diff origin/main | grep` по реквизитам владельца — пусто.

| Треб. | Статус    | Доказательство                                                                                                                                     |
| ----- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1    | выполнено | `lib/office/run.ts` `runScheduledStep`, `app/api/cron/office/route.ts`, шаг «Office step» в `.github/workflows/bot-reminders.yml`; `run.test.ts`   |
| R2    | выполнено | `lib/office/plan.ts` (`defaultPlan`, `parsePlan`, `nextStep`), карточка «План обхода» в `/admin/office`; `plan.test.ts`                            |
| R3    | выполнено | `lib/office/digest.ts` (`buildDigest`, `collectDigest`), окно 08–10 МСК, `onceADay('office-digest')`; `digest.test.ts`                             |
| R4    | выполнено | модель `OfficeRun`, журнал последних 20 прогонов в `/admin/office`                                                                                 |
| R5    | выполнено | `lib/office/sources/osm.ts` (Overpass, фильтр имени на сервере, без сайта, с телефоном); `osm.test.ts`                                             |
| R6    | выполнено | дедуп по `sourceRef`, телефону (10 цифр) и `Company.phone` до обрезки; `run.test.ts` («дедуп идёт до обрезки», «телефон компании в любом формате») |
| R7    | выполнено | `lib/office/sources/manual.ts`, `POST /api/admin/office/manual`, карточка «Добавить вручную»; `manual.test.ts`                                     |
| R8    | частично  | интерфейс `ProspectSource` есть; 2ГИС/Яндекс — PLACEHOLDER (ключи у владельца)                                                                     |
| R9    | выполнено | `lib/office/pages.ts` `buildSitePage`, `components/office/OfficeSitePage.tsx` — без отзывов/цен/фото; `pages.test.ts`                              |
| R10   | выполнено | `buildProviderPage`, `OfficeProviderPage.tsx`: «Заказать технику», «Это моя компания» → `/register?role=provider&prospect=…`                       |
| R11   | выполнено | `app/preview/[token]/page.tsx` (noindex), `/preview` в `robots.ts`, `visibility.test.ts`                                                           |
| R12   | выполнено | `visibleFor` + `app/s/[slug]`, `app/p/[slug]` → 404 до публикации и после отказа; `visibility.test.ts`                                             |
| R13   | выполнено | телефон в `ProviderPage` только при `published: true`; тест «нет телефона до публикации»                                                           |
| R14   | выполнено | `lib/office/scripts.ts` (текст звонка), `lib/office/outreach.ts` (письмо, WhatsApp); тесты                                                         |
| R15   | выполнено | `lib/office/transitions.ts`, `PATCH /api/admin/office/prospects/[id]`, `OfficeProspectControls`; `transitions.test.ts`                             |
| R16   | выполнено | `SITE_PRICES` в `lib/prices.ts`, `officePrices()` из `AppSetting`, карточка «Цены сайта под ключ»; `prices.test.ts`. Значения — PLACEHOLDER        |
| R17   | выполнено | `lib/office/registered.ts` (только при совпадении телефона), хунк в `api/auth/quick-provider`; `registered.test.ts`                                |
| R18   | выполнено | `lib/office/outreachRun.ts`: один раз на канал, лимит в день, «стоп» (`markReplied` из вебхука WhatsApp), пауза; `outreach*.test.ts`               |
| R18a  | выполнено | оговорка в `docs/owner-requests.md` и в карточке «Рассылка» админки                                                                                |
| R19   | выполнено | все маршруты админки — `isAdminRequest()`, крон — `cronAllowed`, публичные страницы получают только `SitePage`/`ProviderPage`                      |
| R20   | выполнено | `schema.prisma`: только две новые модели, строки вместо enum, без правок чужих строк                                                               |

Не проверено вживую: отправка через Resend/Green API и ответ Overpass на проде (в облаке нет
ключей и базы). Первый реальный шаг — после слияния: открыть `/admin/office`, нажать «Запустить
шаг» для «Подрядчики · machinery · Казань» и убедиться, что появились кандидаты.

Открытые PLACEHOLDER-ы перенесены в `docs/owner-requests.md`: цены сайта, ключи Green API и
2ГИС/Яндекс, адрес для ответов, домен клиента.
