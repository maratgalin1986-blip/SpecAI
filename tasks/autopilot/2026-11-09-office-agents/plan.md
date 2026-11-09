# План (ветка `claude/pensive-feynman-bila02` — назначена сессии; от `origin/main` 5c358c6)

Волна 1 (параллельно, файлы не пересекаются):

- [ ] **T1. Схема, агенты, ниши, план, цены.** `packages/database/prisma/schema.prisma` (Prospect,
      OfficeRun); `apps/web/src/lib/office/{agents,niches,plan,prices,types}.ts`; `lib/prices.ts`
      (`SITE_PRICES`). Закрывает R2, R16, R20. Тесты: `plan.test.ts` (parsePlan, nextStep по кругу,
      defaultPlan чередует агентов и покрывает города), `niches.test.ts` (regex техники, виды).
- [ ] **T2. Источники.** `lib/office/sources/{types,osm,manual}.ts`. R5–R8. Тесты: `osm.test.ts`
      (запрос Overpass, разбор фикстуры: без телефона — мимо, с сайтом — помечен, телефон → +7,
      адрес склеен, техника из названия), `manual.test.ts`.
- [ ] **T3. Страницы и скрипты (чистые).** `lib/office/{pages,scripts}.ts`. R9, R10, R14. Тесты:
      `pages.test.ts` (нет телефона до публикации в provider-странице, wa.me, ссылки),
      `scripts.test.ts` (цены из аргумента, обещание из shared, русский).

Волна 2 (после T1–T3; параллельно):

- [ ] **T4. Прогон, крон, сводка, workflow.** `lib/office/{run,digest}.ts`, `app/api/cron/office/route.ts`,
      хунк в `.github/workflows/bot-reminders.yml`. R1, R3, R4, R6. Тесты: `run.test.ts` (мок prisma:
      дедуп по sourceRef/телефону/Company), `digest.test.ts`.
- [ ] **T5. Публичные страницы.** `components/office/*`, `app/preview/[token]`, `app/s/[slug]`,
      `app/p/[slug]`, layout-ы, `robots.ts`. R11–R13. Тест: `officeRoutes.test.ts` на функцию
      `visibleFor(prospect, route)` (404-правила).
- [ ] **T6. Админка и API.** `app/admin/office/page.tsx`, `components/admin/OfficeProspectControls.tsx`
      и формы, `app/api/admin/office/{run,manual,settings}/route.ts`,
      `app/api/admin/office/prospects/[id]/route.ts`, `AdminNav`. R2, R4, R7, R15, R16. Тесты:
      `lib/office/transitions.test.ts` (переходы статусов).
- [ ] **T7. Регистрация по ссылке + команда бота.** `QuickProviderForm` предзаполнение,
      `api/auth/quick-provider` (`prospect`), `lib/office/telegramCommand.ts`, хунк в telegram route.
      R17, п. 9. Тесты: `telegramCommand.test.ts`, `quickProvider` схема принимает `prospect`.

- [ ] **T9. Рассылка.** `lib/office/{outreach,outreachRun}.ts`, хунк в `api/cron/office` (после T4),
      хунк в `api/integrations/whatsapp/route.ts` (`markReplied`), карточка «Рассылка» в админке (после T6).
      R18. Тесты: `outreach.test.ts` (тексты по агентам, строка «стоп», pickChannels: без адреса — нет
      e-mail; WhatsApp только по тегу, если флажок выкл.; второй раз не шлёт), `outreachRun.test.ts`
      (мок prisma: дневной лимит, пауза, ошибки в outreachError).

Волна 3 (я сам):

- [ ] **T8. Проверки, ревью, приёмка, документы.** `/site-check`, `/code-review`, grep по реквизитам;
      `acceptance.md`; `docs/owner-requests.md`, `docs/roadmap.md` (строка «сделано»), `docs/ai-office.md`
      (таблица офиса: два агента), `docs/sessions/handoff.md`, `.env.example` (без новых переменных —
      проверить), PR.

Субагенты не коммитят: коммит `T<n>: …` делаю после каждой волны. Заблокированные задачи помечаются здесь.
