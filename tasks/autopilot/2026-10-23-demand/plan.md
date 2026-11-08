# План

- T1. Схема + `lib/demandNudge.ts` + событие `demand.today` в routing/deliver (только push, telegram) + тесты. R2–R5, R7, R9, R11, R12.
- T2. `lib/demandNudgeData.ts` (claim, send, enabled/set) + вызов из `/api/cron/notices` + тесты. R1–R6, R10, R12. После T1.
- T3. `/api/account/demand-nudge` + выключатель на сайте и в приложении + тесты. R8, R12. После T2.

Проверки: `/site-check`, `expo export`, `/code-review`; приёмка в `acceptance.md`.
