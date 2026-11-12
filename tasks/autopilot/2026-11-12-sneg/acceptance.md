# Приёмка

Проверки 2026‑11‑12: `pnpm lint`, `pnpm typecheck`, `pnpm format:check` — без замечаний;
`pnpm test` — web 2805, mobile 189, shared 100, ai-service 28, database 9, все прошли;
`next build` — прошёл, `/uborka-snega` статическая (3,03 кБ); e2e на своей сборке — 96 прошли,
6 пропущены (как в `main`), из них 8 — `e2e/sneg.spec.ts` (телефон 390 px и компьютер).

| №   | Требование                                         | Итог      | Доказательство                                                                                                                                                                |
| --- | -------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Страница `/uborka-snega` открыта всем              | выполнено | `app/uborka-snega/page.tsx`; e2e «renders at 390 px»; сборка: `○ /uborka-snega`                                                                                               |
| R2  | Только погрузчик, самосвал, трактор; без грейдера  | выполнено | `sneg.test.ts` «names only machines that have a price and a page», «has no grader»                                                                                            |
| R3  | Пакет: цены из `lib/prices.ts`, сумма посчитана    | выполнено | `sneg.test.ts` «snegPackage», «has no ruble figure that is not a price-list price»; e2e «prices are the helpers»                                                              |
| R4  | Шесть адресатов                                    | выполнено | `sneg.test.ts` «names all six audiences»; снимок `sneg-390-scroll-4.png`                                                                                                      |
| R5  | «Как работаем»                                     | выполнено | `SNEG_STEPS`; снимок `sneg-390-scroll-5.png`                                                                                                                                  |
| R6  | Телефон, WhatsApp, Telegram                        | выполнено | e2e: `tel:` у `sneg-call`, ссылка `wa.me`; снимок `sneg-1280-top.png`                                                                                                         |
| R7  | Форма: телефон + согласие, адрес и «что убрать»    | выполнено | e2e «the form sends a lead with the source sneg» (тело запроса); `sneg.test.ts` «reads as «Уборка снега» in /admin/leads»                                                     |
| R8  | «Принято» и цель `sneg_lead`                       | частично  | Экран «Принято» — e2e и снимок `sneg-390-sent.png`. Цель отправляется (`SnegForm.tsx`), но в счётчике Метрики её ещё нет — PLACEHOLDER; общая цель `lead` считается           |
| R9  | Челны: 2 часа, свой парк на линии, НДС             | выполнено | e2e (`sneg-house` содержит «Подача по Челнам в течение 2 часов»); снимок `sneg-1280-scroll-3.png`                                                                             |
| R10 | Другие города — заявка на площадке                 | выполнено | e2e (`sneg-other` → `/orders`); `sneg.test.ts` «promises delivery within two hours in Челны only»; JSON-LD `areaServed` — только Набережные Челны                             |
| R11 | Метаданные, `Service` + `FAQPage`, карта сайта     | выполнено | В HTML сборки: `og:title`, `og:description`, `og:url`, `og:image`, canonical; e2e проверяет оба типа JSON-LD; `sitemap.xml` содержит адрес (1 строка). IndexNow — см. spec.md |
| R12 | Подвал, сезонная строка на главной, меню           | выполнено | e2e «linked from the footer and, in season, from the home page»; `sneg.test.ts` «isSnowSeason» (граница по Москве); снимки `home-390-link.png`, `home-1280-link.png`          |
| R13 | «Сторож»                                           | выполнено | `storozh.test.ts`: `/uborka-snega` разрешён                                                                                                                                   |
| R14 | Слой «шоу», нет горизонтальной прокрутки на 390 px | выполнено | `showGate.test.ts`; e2e: `data-show` на `<html>`, прокрутка ≤ 0                                                                                                               |
| R15 | Тексты: бренд, «заявка», «диспетчер», Иван, без ИИ | выполнено | `sneg.test.ts` «has no grader, no AI promise, no superlatives»; снимок `sneg-1280-top.png` (Иван под формой)                                                                  |

Итог: 14 выполнено, 1 частично (нужна настройка счётчика владельцем), 0 не выполнено.

## Не сделано

- `/uborka-snega/[city]` — вне объёма (spec.md, «Города»).
- Другие страницы сайта (`/arenda/*`, `/raboty/*`) отдают `og:title` без `og:image`: своя
  `openGraph` заменяет корневую целиком. Здесь исправлено только для новой страницы; общий
  помощник метаданных — отдельная задача.

## PLACEHOLDER — уточнить у владельца

- Завести в Метрике JavaScript-цель `sneg_lead`.
- Подтвердить «договор на сезон: техника по вызову, оплата по часам» (ответ в вопросах страницы).
- Куда вывозится снег и цена рейса или приёма — сейчас называет диспетчер.
- Работа парка ночью и в воскресенье — на странице только часы диспетчера.

Снимки: `/tmp/claude-0/-home-user-SpecAI/03a6e623-d732-5703-91e9-243e2d0ac054/scratchpad/shots/sneg/`
(вне репозитория).
