import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@specai/database';
import { createReviewSchema } from '@specai/shared';
import { authOptions } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createReviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const booking = await prisma.booking.findUnique({
    where: { id: parsed.data.bookingId },
    include: { equipment: true, review: true },
  });

  if (!booking || booking.customerId !== session.user.id) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }
  if (booking.status !== 'COMPLETED') {
    return NextResponse.json({ error: 'Only completed bookings can be reviewed' }, { status: 409 });
  }
  if (booking.review) {
    return NextResponse.json({ error: 'This booking already has a review' }, { status: 409 });
  }

  const review = await prisma.review.create({
    data: {
      bookingId: booking.id,
      authorId: session.user.id,
      companyId: booking.equipment.companyId,
      equipmentId: booking.equipmentId,
      rating: parsed.data.rating,
      comment: parsed.data.comment,
    },
  });

  return NextResponse.json({ review }, { status: 201 });
}
