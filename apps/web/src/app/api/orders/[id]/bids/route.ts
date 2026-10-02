import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@specai/database';
import { getRequestUser } from '@/lib/requestUser';
import { sendEmail } from '@/lib/email';
import { newBidReceived } from '@/lib/emailTemplates';
import { notifyTelegram } from '@/lib/notify';
import { formatMoney } from '@/lib/money';
import { siteUrl } from '@/lib/siteUrl';
import { INVALID_JSON_MESSAGE, readJson, zodErrorMessage } from '@/lib/apiInput';
import { unavailableEquipmentMessage } from '@/lib/bookingRules';
import { isFleetManager } from '@/lib/fleet';

const requestSchema = z.object({
  // Not a cuid: the owner's own fleet uses readable ids like "sp16-jcb-4cx".
  equipmentId: z
    .string({ required_error: 'Выберите технику' })
    .min(1, 'Выберите технику')
    .max(64, 'Техника не найдена'),
  price: z
    .number({ invalid_type_error: 'Укажите цену числом', required_error: 'Укажите цену' })
    .positive('Цена должна быть больше нуля')
    .max(99_999_999, 'Слишком большая цена'),
  message: z.string().max(1000, 'Сообщение слишком длинное (до 1000 знаков)').optional(),
});

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const currentUser = await getRequestUser(request);
  if (!isFleetManager(currentUser)) {
    return NextResponse.json({ error: 'Требуется аккаунт поставщика' }, { status: 403 });
  }

  const body = await readJson(request);
  if (body === null) {
    return NextResponse.json({ error: INVALID_JSON_MESSAGE }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: { customer: { select: { email: true } } },
  });
  if (!order || order.status !== 'OPEN') {
    return NextResponse.json({ error: 'Заявка не найдена или уже закрыта' }, { status: 404 });
  }

  const equipment = await prisma.equipment.findUnique({ where: { id: parsed.data.equipmentId } });
  if (!equipment || equipment.companyId !== currentUser.companyId) {
    return NextResponse.json(
      { error: 'Можно предлагать только собственную технику' },
      { status: 403 },
    );
  }
  const unavailable = unavailableEquipmentMessage(equipment.status);
  if (unavailable) {
    return NextResponse.json(
      { error: `${unavailable} — предложить можно только доступную технику` },
      { status: 409 },
    );
  }

  const bid = await prisma.bid.create({
    data: {
      orderId: order.id,
      equipmentId: equipment.id,
      price: parsed.data.price,
      currency: equipment.currency,
      message: parsed.data.message,
    },
  });

  try {
    const template = newBidReceived({
      orderId: order.id,
      orderDescription: order.description,
      equipmentName: equipment.name,
      price: bid.price,
      currency: bid.currency,
      message: bid.message,
    });
    await sendEmail({ to: order.customer.email, ...template });
    if (order.source !== 'SITE') {
      // Imported orders have no real customer account — tell the site owner instead.
      await notifyTelegram(
        `💰 Предложение по заявке из чата: ${equipment.name} — ${formatMoney(bid.price, bid.currency)}\n` +
          `${order.description.slice(0, 200)}\n${siteUrl()}/orders/${order.id}`,
      );
    }
  } catch (error) {
    console.error('[email] newBidReceived failed', error);
  }

  return NextResponse.json({ bid }, { status: 201 });
}
