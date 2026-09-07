import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { prisma } from '@specai/database';
import { authOptions } from '@/lib/auth';

const requestSchema = z.object({
  equipmentId: z.string().cuid(),
  price: z.number().positive(),
  message: z.string().max(1000).optional(),
});

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'PROVIDER_ADMIN' || !session.user.companyId) {
    return NextResponse.json({ error: 'Требуется аккаунт поставщика' }, { status: 403 });
  }

  const body = await request.json();
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const order = await prisma.order.findUnique({ where: { id: params.id } });
  if (!order || order.status !== 'OPEN') {
    return NextResponse.json({ error: 'Заявка не найдена или уже закрыта' }, { status: 404 });
  }

  const equipment = await prisma.equipment.findUnique({ where: { id: parsed.data.equipmentId } });
  if (!equipment || equipment.companyId !== session.user.companyId) {
    return NextResponse.json(
      { error: 'Можно предлагать только собственную технику' },
      { status: 403 },
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

  return NextResponse.json({ bid }, { status: 201 });
}
