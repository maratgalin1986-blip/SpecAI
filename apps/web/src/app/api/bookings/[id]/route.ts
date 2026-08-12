import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { prisma } from '@specai/database';
import { authOptions } from '@/lib/auth';

const updateSchema = z.object({
  status: z.enum(['CONFIRMED', 'ACTIVE', 'COMPLETED', 'CANCELLED']),
});

const PROVIDER_ALLOWED_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['COMPLETED'],
};

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const booking = await prisma.booking.findUnique({
    where: { id: params.id },
    include: { equipment: true },
  });
  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  const isOwningProvider =
    session.user.role === 'PROVIDER_ADMIN' &&
    session.user.companyId === booking.equipment.companyId;
  const isCustomer = booking.customerId === session.user.id;

  if (isOwningProvider) {
    const allowed = PROVIDER_ALLOWED_TRANSITIONS[booking.status] ?? [];
    if (!allowed.includes(parsed.data.status)) {
      return NextResponse.json(
        { error: `Cannot move booking from ${booking.status} to ${parsed.data.status}` },
        { status: 409 },
      );
    }
  } else if (isCustomer) {
    if (parsed.data.status !== 'CANCELLED' || !['PENDING', 'CONFIRMED'].includes(booking.status)) {
      return NextResponse.json(
        { error: 'Customers may only cancel pending or confirmed bookings' },
        {
          status: 409,
        },
      );
    }
  } else {
    return NextResponse.json({ error: 'Not authorized to update this booking' }, { status: 403 });
  }

  const updated = await prisma.booking.update({
    where: { id: params.id },
    data: { status: parsed.data.status },
  });

  return NextResponse.json({ booking: updated });
}
