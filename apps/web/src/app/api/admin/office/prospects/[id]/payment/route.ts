import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { z } from 'zod';
import { isAdminRequest } from '@/lib/admin';
import { INVALID_JSON_MESSAGE, readJson, zodErrorMessage } from '@/lib/apiInput';
import {
  BILLABLE_STATUSES,
  CLIENT_PRICE_MAX,
  PAYMENT_ACTIONS,
  paymentUpdate,
} from '@/lib/office/billing';
import { rub } from '@/lib/prices';

export const dynamic = 'force-dynamic';

// Отметка оплаты клиента «Сайты под ключ» с /admin/office/clients (S6). Онлайн-оплаты нет:
// клиент платит по счёту /oplata/<token>, владелец нажимает «Сайт оплачен», «+1 месяц»,
// «+12 месяцев» или «Отменить оплату»; prices — только сохранить цены клиента. Цены клиента
// (целые 0…CLIENT_PRICE_MAX ₽, null — по базе из настроек офиса) сохраняются с любым действием.
// Только сайты (kind site) в статусе AGREED / PUBLISHED. Клиент присылает «оплачено до», которое
// видел владелец (expectedPaidUntil, ISO или null): продление считается от него и пишется только
// если в базе то же значение. Вторая вкладка, двойное нажатие или повтор после таймаута — 409,
// продление не удваивается.
const ID = /^[\w-]{1,64}$/;

const PAID_UNTIL_CHANGED = 'Дата оплаты уже изменилась — обновите страницу';

const EXPECTED_MESSAGE =
  'Не передана дата «оплачено до», которую видно на экране, — обновите страницу и повторите';

const clientPrice = z
  .number({ invalid_type_error: 'Цена — целое число рублей' })
  .int('Цена — целое число рублей')
  .min(0, 'Цена не может быть отрицательной')
  .max(CLIENT_PRICE_MAX, `Цена — не больше ${rub(CLIENT_PRICE_MAX)} ₽`)
  .nullable()
  .optional();

const schema = z.object({
  action: z.enum(PAYMENT_ACTIONS, {
    errorMap: () => ({ message: 'Непонятное действие: сайт, месяц, год, отмена или цены' }),
  }),
  setupPrice: clientPrice,
  monthlyPrice: clientPrice,
  expectedPaidUntil: z
    .string({
      required_error: EXPECTED_MESSAGE,
      invalid_type_error: EXPECTED_MESSAGE,
    })
    .datetime({ offset: true, message: EXPECTED_MESSAGE })
    .nullable(),
});

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });
  }
  if (!ID.test(params.id)) {
    return NextResponse.json({ error: 'Клиент не найден' }, { status: 404 });
  }
  const json = await readJson(request);
  if (json === null) return NextResponse.json({ error: INVALID_JSON_MESSAGE }, { status: 400 });
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }
  const { action, setupPrice, monthlyPrice } = parsed.data;
  const expectedPaidUntil =
    parsed.data.expectedPaidUntil === null ? null : new Date(parsed.data.expectedPaidUntil);

  const prospect = await prisma.prospect.findUnique({
    where: { id: params.id },
    select: { id: true, kind: true, status: true, paidUntil: true },
  });
  if (!prospect || prospect.kind !== 'site') {
    return NextResponse.json({ error: 'Клиент не найден' }, { status: 404 });
  }
  if (!BILLABLE_STATUSES.includes(prospect.status)) {
    return NextResponse.json(
      { error: 'Оплату можно отметить только у сайта, который согласовали или опубликовали' },
      { status: 409 },
    );
  }

  if ((prospect.paidUntil?.getTime() ?? null) !== (expectedPaidUntil?.getTime() ?? null)) {
    return NextResponse.json({ error: PAID_UNTIL_CHANGED }, { status: 409 });
  }

  const data: {
    setupPaidAt?: Date | null;
    paidUntil?: Date | null;
    setupPrice?: number | null;
    monthlyPrice?: number | null;
  } = paymentUpdate({ paidUntil: expectedPaidUntil }, action, new Date());
  if (setupPrice !== undefined) data.setupPrice = setupPrice;
  if (monthlyPrice !== undefined) data.monthlyPrice = monthlyPrice;
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Нечего сохранять' }, { status: 400 });
  }

  const updated = await prisma.prospect.updateMany({
    where: {
      id: prospect.id,
      kind: 'site',
      status: { in: [...BILLABLE_STATUSES] },
      paidUntil: expectedPaidUntil,
    },
    data,
  });
  if (updated.count === 0) {
    return NextResponse.json({ error: PAID_UNTIL_CHANGED }, { status: 409 });
  }
  const paidUntil = data.paidUntil === undefined ? expectedPaidUntil : data.paidUntil;
  return NextResponse.json({ ok: true, paidUntil: paidUntil ? paidUntil.toISOString() : null });
}
