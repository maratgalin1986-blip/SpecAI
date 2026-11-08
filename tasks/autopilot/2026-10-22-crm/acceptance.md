# Приёмка

| Требование                  | Статус    | Доказательство                                                                                                             |
| --------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------- |
| R1 заметка                  | выполнено | `LeadCrmFields.tsx` (textarea, сохранение по blur/кнопке), `leadCrmPatchSchema` note ≤ 2000, тест `lead.test.ts`           |
| R2 перезвонить + автостатус | выполнено | `api/admin/leads/[id]/route.ts` (callAt → IN_PROGRESS, если NEW), тест схемы callAt → Date                                 |
| R3 город                    | выполнено | `city` ≤ 80 в схеме и компоненте                                                                                           |
| R4 список /admin/leads      | выполнено | `app/admin/leads/page.tsx`; порядок `sortCrm`, тест «sorts overdue, new, today, in work, done»                             |
| R5 фильтры                  | выполнено | `parseCrmQuery`/`filterCrm`, тест «filters by status, today, city and dates together»                                      |
| R6 счётчики                 | выполнено | `crmCounters`, StatTile ×3, тест                                                                                           |
| R7 напоминание в Telegram   | выполнено | `remindCallbacks` в `cron/daily`, `onceADay('lead-callbacks')`, тест `callbackReminderText` (завтра, просрочено, 30 строк) |
| R8 навигация                | выполнено | `AdminNav` «Звонки» → /admin/leads; ссылка «Открыть CRM» на /admin                                                         |
| R9 доступ/валидация         | выполнено | `isAdminRequest`, zod, 400/401/404 по-русски                                                                               |
| R10 схема                   | выполнено | три nullable-колонки + индекс callAt, enum не тронут                                                                       |
| R11 тесты                   | выполнено | 13 новых тестов (adminCrm 10, lead schema 3); `pnpm test` — 1948 зелёных                                                   |

Проверено локально: typecheck, eslint, prettier, vitest. **Не проверено локально:** `next build`
(в этой среде закрыт доступ к Google Fonts — сборка падает на шрифтах, не на коде) и внешний
вид страницы в браузере (нет базы). Это проверит CI (build + smoke) и первый просмотр
владельцем /admin/leads после выкладки.
