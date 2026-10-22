# План

| T  | Что                                                                                   | Файлы                                                                 | Закрывает | Проверка                      | Статус |
| -- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------- | ----------------------------- | ------ |
| T1 | Колонки note/callAt/city + индекс                                                     | packages/database/prisma/schema.prisma                                | R10       | prisma generate, typecheck    |        |
| T2 | API PATCH: note/callAt/city, автостатус IN_PROGRESS                                   | api/admin/leads/[id]/route.ts, packages/shared lead.ts (схема)        | R1–R3, R9 | тест схемы leadCrmPatchSchema |        |
| T3 | Чистые функции adminCrm.ts + тесты                                                    | lib/adminCrm.ts, lib/adminCrm.test.ts                                 | R4–R7,R11 | vitest                        |        |
| T4 | Клиентский LeadCrmFields                                                              | components/LeadCrmFields.tsx                                          | R1–R3     | typecheck, визуально          |        |
| T5 | Страница /admin/leads, нав, ссылка на /admin                                          | app/admin/leads/page.tsx, components/admin/AdminNav.tsx, admin/page.tsx| R4–R6,R8  | next build, смоук             |        |
| T6 | Напоминание в cron/daily                                                              | api/cron/daily/route.ts                                               | R7        | тест текста, typecheck        |        |

Отступление от навыка: прогон по поручению «делай всё сейчас» идёт в одной сессии без
субагентов (контекст уже собран, задачи маленькие); коммит на каждую T.
