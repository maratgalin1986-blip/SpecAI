import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAdminRequest } from '@/lib/admin';
import { INVALID_JSON_MESSAGE, readJson, zodErrorMessage } from '@/lib/apiInput';
import { sendOutreach } from '@/lib/office/outreachRun';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Сколько времени у отправки по кнопке, мс: укладываемся в maxDuration с запасом. */
const OUTBOX_BUDGET_MS = 45_000;
/** Больше ключей за раз не бывает (дневной лимит — до 1000 на канал, ключ на канал и тип). */
const MAX_IDS = 3000;

// «Отправить N писем» на /admin/office/pisma (К2): владелец просмотрел письма дня и отметил те,
// что не отправлять. `ids` — ключи утверждения (строка, канал, первое письмо или напоминание —
// approvalKey в outreachRun.ts) всего, что он видел на странице, `exclude` — отмеченных; уходит
// только ids без exclude, только в показанные каналы и только с тем предложением, что было
// показано (sendOutreach с onlyApproved). Отправка по клику человека — так закон «О рекламе»
// (ч. 2 ст. 18) не считает её автоматической. Ответ — только числа.
const id = z.string().trim().min(1).max(100);
const schema = z.object({
  send: z.literal(true, { errorMap: () => ({ message: 'Нажмите «Отправить»' }) }),
  ids: z.array(id).max(MAX_IDS, 'Слишком много писем за раз'),
  exclude: z.array(id).max(MAX_IDS, 'Слишком много писем за раз').default([]),
});

export async function POST(request: NextRequest) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });
  }
  const json = await readJson(request);
  if (json === null) return NextResponse.json({ error: INVALID_JSON_MESSAGE }, { status: 400 });
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }
  const excluded = new Set(parsed.data.exclude);
  const approved = [...new Set(parsed.data.ids)].filter((x) => !excluded.has(x));
  if (approved.length === 0) {
    return NextResponse.json(
      { error: 'Не выбрано ни одного письма — отметьте хотя бы одно' },
      { status: 400 },
    );
  }
  const result = await sendOutreach(new Date(), {
    budgetMs: OUTBOX_BUDGET_MS,
    onlyApproved: approved,
  });
  if (result.skipped === 'paused') {
    return NextResponse.json(
      { error: 'Рассылка на паузе — снимите паузу в офисе и нажмите ещё раз' },
      { status: 409 },
    );
  }
  return NextResponse.json({
    ok: true,
    email: result.email,
    whatsapp: result.whatsapp,
    followUps: result.followUps ?? 0,
    errors: result.errors,
    optedOut: result.optedOut ?? 0,
    noSmtp: result.mail === 'no-smtp',
  });
}
