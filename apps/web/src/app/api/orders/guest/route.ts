import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { createGuestOrderSchema } from '@specai/shared';
import { INVALID_JSON_MESSAGE, readJson, zodErrorMessage } from '@/lib/apiInput';
import { bidsUntilFor } from '@/lib/bidWindow';
import { checkBookingDates } from '@/lib/bookingRules';
import { geocodeAddress } from '@/lib/geo';
import { GUEST_ORDER_SUCCESS } from '@/lib/guestOrder';
import { technicalUserId } from '@/lib/ingest';
import { notifyTelegram } from '@/lib/notify';
import { notifyProvidersAboutOrder } from '@/lib/notifications/notifyUser';
import { maskContacts } from '@/lib/privacy';
import { LEAD_RATE_LIMIT, checkRateLimit } from '@/lib/rateLimit';
import { SITE } from '@/lib/site';
import { siteUrl } from '@/lib/siteUrl';

export const dynamic = 'force-dynamic';

/**
 * A guest's order from the site (no registration on the site, owner
 * 2026-10-03): the order goes on the board under the technical «Заявка с
 * сайта» account with the guest's name and phone in contactName/contactPhone.
 * Providers see the phone masked and open it with «Показать телефон»; the
 * owner gets the full lead in Telegram, like the callback form.
 */
export async function POST(request: NextRequest) {
  const body = await readJson(request);
  if (body === null) {
    return NextResponse.json({ error: INVALID_JSON_MESSAGE }, { status: 400 });
  }
  // Bots that fill the honeypot get a fake success before validation.
  if (typeof body === 'object' && typeof (body as { website?: unknown }).website === 'string') {
    if ((body as { website: string }).website) {
      return NextResponse.json({ ok: true, message: GUEST_ORDER_SUCCESS }, { status: 201 });
    }
  }
  const parsed = createGuestOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }
  const dates = checkBookingDates(parsed.data.desiredStartDate, parsed.data.desiredEndDate);
  if (!dates.ok) return NextResponse.json({ error: dates.error }, { status: 400 });

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!checkRateLimit(`guest-orders:${ip}`, LEAD_RATE_LIMIT).ok) {
    return NextResponse.json(
      { error: `Слишком много заявок. Позвоните нам: ${SITE.phone}` },
      { status: 429 },
    );
  }

  const address = parsed.data.address;
  const place = address ? await geocodeAddress(address) : null;
  const location = address
    ? await prisma.location.create({
        data: {
          addressLine: address,
          city: place?.city ?? SITE.city,
          country: 'Россия',
          latitude: place?.lat ?? null,
          longitude: place?.lon ?? null,
        },
      })
    : null;

  const category = parsed.data.categoryId
    ? await prisma.equipmentCategory.findUnique({ where: { id: parsed.data.categoryId } })
    : null;
  const now = new Date();
  const order = await prisma.order.create({
    data: {
      customerId: await technicalUserId('guest'),
      // The public text never carries the guest's phone (152-ФЗ).
      description: maskContacts(parsed.data.description).slice(0, 2000),
      desiredStartDate: dates.startDate,
      desiredEndDate: dates.endDate,
      categoryId: category?.id,
      locationId: location?.id,
      source: 'SITE',
      contactName: parsed.data.name,
      contactPhone: parsed.data.phone,
      rawText: parsed.data.description.slice(0, 4000),
      bidsUntil: bidsUntilFor(now, dates.startDate),
    },
  });

  const day = (date: Date) => date.toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' });
  await notifyTelegram(
    [
      `🧾 Новая заявка с сайта (без входа) — ${SITE.name}`,
      category ? `Техника: ${category.name}` : null,
      `Когда: ${day(dates.startDate)}${dates.days > 1 ? ` – ${day(dates.endDate)}` : ''}`,
      place ? `Где: ${place.label}` : address ? `Где: ${address}` : null,
      `Задача: ${parsed.data.description.slice(0, 300)}`,
      `Имя: ${parsed.data.name}`,
      `Телефон: ${parsed.data.phone}`,
      `Заявка: ${siteUrl()}/orders/${order.id}`,
    ]
      .filter(Boolean)
      .join('\n'),
  );
  // Providers with this kind of machinery within their radius hear at once.
  await notifyProvidersAboutOrder(order.id);

  return NextResponse.json(
    { ok: true, orderId: order.id, bidsUntil: order.bidsUntil, message: GUEST_ORDER_SUCCESS },
    { status: 201 },
  );
}
