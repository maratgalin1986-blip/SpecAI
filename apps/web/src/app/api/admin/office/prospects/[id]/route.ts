import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { z } from 'zod';
import { isAdminRequest } from '@/lib/admin';
import { INVALID_JSON_MESSAGE, readJson, zodErrorMessage } from '@/lib/apiInput';
import { PROSPECT_ACTIONS, applyAction } from '@/lib/office/transitions';
import { PROSPECT_STATUSES, type ProspectStatus } from '@/lib/office/types';

export const dynamic = 'force-dynamic';

// Отметка результата по кандидату из /admin/office (R15): «Согласился» публикует,
// «Напомнить» ставит дату, «Отказ» снимает, «Ответил» — отметка, заметка — текст.
const ID = /^[\w-]{1,64}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const NOTE_MAX = 1000;

const schema = z.object({
  action: z.enum(PROSPECT_ACTIONS as [string, ...string[]]),
  callAt: z.string().trim().max(40).optional().nullable(),
  note: z.string().max(5000).optional().nullable(),
});

/** Дата напоминания: «YYYY-MM-DD» — 09:00 того дня по Москве, иначе момент ISO. */
function parseCallAt(value: string | null | undefined): Date | null | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const date = DAY.test(value) ? new Date(`${value}T09:00:00+03:00`) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminRequest()) return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });
  if (!ID.test(params.id))
    return NextResponse.json({ error: 'Кандидат не найден' }, { status: 404 });
  const json = await readJson(request);
  if (json === null) return NextResponse.json({ error: INVALID_JSON_MESSAGE }, { status: 400 });
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }
  const action = parsed.data.action as (typeof PROSPECT_ACTIONS)[number];
  const callAt = parseCallAt(parsed.data.callAt);
  if (callAt === null) {
    return NextResponse.json({ error: 'Непонятная дата напоминания' }, { status: 400 });
  }

  const prospect = await prisma.prospect.findUnique({
    where: { id: params.id },
    select: { id: true, status: true },
  });
  if (!prospect) return NextResponse.json({ error: 'Кандидат не найден' }, { status: 404 });
  const status = (PROSPECT_STATUSES as readonly string[]).includes(prospect.status)
    ? (prospect.status as ProspectStatus)
    : null;
  if (!status) {
    return NextResponse.json({ error: 'Так отметить нельзя: неизвестный статус' }, { status: 409 });
  }

  const result = applyAction(status, action, new Date(), callAt);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });

  const data: Record<string, unknown> = { ...result.data, status: result.status };
  if (parsed.data.note !== undefined) {
    const note = (parsed.data.note ?? '').trim().slice(0, NOTE_MAX);
    data.note = note || null;
  }
  await prisma.prospect.update({ where: { id: prospect.id }, data });
  return NextResponse.json({ status: result.status });
}
