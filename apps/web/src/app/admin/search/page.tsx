import type { Metadata } from 'next';
import { prisma } from '@specai/database';
import { BookingStatusBadge } from '@specai/ui';
import { ORDER_STATUS_LABELS } from '@specai/shared';
import { adminGate } from '@/components/admin/AdminGate';
import { AdminPageHeader } from '@/components/admin/AdminUi';
import { PhoneLink } from '@/components/admin/PhoneLink';
import { adminMatches, phoneNeedle } from '@/lib/adminSearch';
import { clipText } from '@/lib/adminFeed';
import { roleLabel } from '@/lib/linkOwner';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Поиск · CRM', robots: { index: false } };

type Query = Record<string, string | string[] | undefined>;

/** Rows looked at per kind: phones are compared by digits in code. */
const SCAN = 5000;
const SHOW = 30;

const msk = (date: Date) => date.toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' });

/**
 * One search box over callback leads, orders, bookings, customers and
 * providers: a part of a name, a phone in any spelling, an e-mail or an
 * order id.
 */
async function search(q: string) {
  const byPhone = phoneNeedle(q) !== null;
  const text = { contains: q, mode: 'insensitive' as const };
  const [leads, users, companies, orders] = await Promise.all([
    prisma.lead.findMany({
      // Bot drafts without a phone are not leads yet.
      where: { NOT: { phone: '' }, ...(byPhone ? {} : { name: text }) },
      select: { id: true, name: true, phone: true, status: true, createdAt: true, message: true },
      orderBy: { createdAt: 'desc' },
      take: SCAN,
    }),
    prisma.user.findMany({
      where: byPhone ? { phone: { not: null } } : { OR: [{ name: text }, { email: text }] },
      select: { id: true, name: true, email: true, phone: true, role: true, companyId: true },
      orderBy: { createdAt: 'desc' },
      take: SCAN,
    }),
    prisma.company.findMany({
      where: byPhone ? { phone: { not: null } } : { name: text },
      select: { id: true, name: true, phone: true, isProvider: true },
      take: SCAN,
    }),
    prisma.order.findMany({
      where: byPhone
        ? { contactPhone: { not: null } }
        : { OR: [{ id: q }, { contactName: text }, { description: text }] },
      select: { id: true, contactPhone: true },
      orderBy: { createdAt: 'desc' },
      take: SCAN,
    }),
  ]);
  const leadHits = leads.filter((lead) => adminMatches(q, [lead.name], [lead.phone]));
  const userHits = users.filter((user) => adminMatches(q, [user.name, user.email], [user.phone]));
  const companyHits = companies.filter((company) =>
    adminMatches(q, [company.name], [company.phone]),
  );
  const orderIds = orders
    .filter((order) => !byPhone || adminMatches(q, [], [order.contactPhone]))
    .map((order) => order.id);
  const userIds = userHits.map((user) => user.id);
  const companyIds = companyHits.map((company) => company.id);
  const [orderRows, bookingRows] = await Promise.all([
    prisma.order.findMany({
      where: { OR: [{ id: { in: orderIds } }, { customerId: { in: userIds } }] },
      select: {
        id: true,
        status: true,
        description: true,
        desiredStartDate: true,
        contactName: true,
        contactPhone: true,
        customer: { select: { name: true, phone: true } },
        category: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: SHOW,
    }),
    prisma.booking.findMany({
      where: {
        OR: [
          { customerId: { in: userIds } },
          { equipment: { companyId: { in: companyIds } } },
          { orderId: { in: orderIds } },
        ],
      },
      select: BOOKING_SELECT,
      orderBy: { createdAt: 'desc' },
      take: SHOW,
    }),
  ]);
  return {
    leads: leadHits.slice(0, SHOW),
    users: userHits.slice(0, SHOW),
    companies: companyHits.slice(0, SHOW),
    orders: orderRows,
    bookings: bookingRows,
  };
}

const BOOKING_SELECT = {
  id: true,
  status: true,
  startDate: true,
  orderId: true,
  customer: { select: { name: true, phone: true } },
  equipment: { select: { name: true, company: { select: { name: true, phone: true } } } },
} as const;

type BookingHit = {
  id: string;
  status: 'PENDING' | 'CONFIRMED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  startDate: Date;
  orderId: string | null;
  customer: { name: string; phone: string | null };
  equipment: { name: string; company: { name: string; phone: string | null } };
};

/** A booking with both phones: the customer and the provider. */
function BookingRow({ booking }: { booking: BookingHit }) {
  return (
    <li className="flex flex-col gap-0.5 py-2">
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{booking.equipment.name}</span>
        <BookingStatusBadge status={booking.status} />
        <span className="text-xs text-graphite-500">с {msk(booking.startDate)}</span>
        {booking.orderId && (
          <a href={`/orders/${booking.orderId}`} className="text-xs underline">
            заявка
          </a>
        )}
      </span>
      <span className="text-xs text-graphite-600">
        Заказчик: {booking.customer.name} <PhoneLink phone={booking.customer.phone} /> ·
        Исполнитель: «{booking.equipment.company.name}»{' '}
        <PhoneLink phone={booking.equipment.company.phone} />
      </span>
    </li>
  );
}

/** Without a query: the bookings in work now and ahead, to call either side. */
async function currentBookings() {
  return prisma.booking.findMany({
    where: {
      status: { in: ['PENDING', 'CONFIRMED', 'ACTIVE'] },
      endDate: { gte: new Date(Date.now() - 86_400_000) },
    },
    select: BOOKING_SELECT,
    orderBy: { startDate: 'asc' },
    take: SHOW,
  });
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="cab-card flex flex-col gap-2">
      <h2 className="font-semibold text-graphite-950">
        {title} <span className="text-graphite-400">({count})</span>
      </h2>
      {count === 0 ? (
        <p className="text-sm text-graphite-500">Ничего не найдено.</p>
      ) : (
        <ul className="divide-y divide-graphite-100 text-sm">{children}</ul>
      )}
      {/* The lists stop at SHOW rows without saying so otherwise. */}
      {count >= SHOW && (
        <p className="text-xs text-graphite-500">
          Показаны первые {SHOW} — уточните запрос, чтобы увидеть остальные.
        </p>
      )}
    </section>
  );
}

export default async function AdminSearchPage({ searchParams }: { searchParams: Query }) {
  const gate = adminGate();
  if (gate) return gate;
  const raw = Array.isArray(searchParams.q) ? searchParams.q[0] : searchParams.q;
  const q = (raw ?? '').trim().slice(0, 100);
  const result = q.length >= 2 ? await search(q) : null;
  const upcoming = result ? [] : await currentBookings();

  return (
    <div className="flex flex-col gap-5">
      <AdminPageHeader
        title="Поиск"
        text="Телефон в любом виде, часть имени, e-mail или номер заявки: звонки, заявки, брони, заказчики и исполнители."
      />
      <form action="/admin/search" className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="+7 917 555 или Анна"
          aria-label="Что найти"
          className="min-h-[44px] min-w-0 flex-1 rounded-full border border-graphite-200 bg-white px-4 text-sm focus:border-graphite-800 focus:outline-none"
        />
        <button type="submit" className="cab-action">
          Найти
        </button>
      </form>
      {q.length > 0 && q.length < 2 && (
        <p className="text-sm text-graphite-500">Введите хотя бы два символа.</p>
      )}
      {!result && (
        <Section title="Брони в работе и впереди" count={upcoming.length}>
          {upcoming.map((booking) => (
            <BookingRow key={booking.id} booking={booking} />
          ))}
        </Section>
      )}
      {result && (
        <>
          <Section title="Заявки на звонок" count={result.leads.length}>
            {result.leads.map((lead) => (
              <li key={lead.id} className="py-2">
                {lead.name || 'Без имени'} · <PhoneLink phone={lead.phone} />
                <span className="text-xs text-graphite-500">
                  {' '}
                  · {msk(lead.createdAt)}
                  {lead.message ? ` · ${clipText(lead.message, 80)}` : ''}
                </span>
              </li>
            ))}
          </Section>
          <Section title="Заявки на технику" count={result.orders.length}>
            {result.orders.map((order) => (
              <li key={order.id} className="flex flex-col gap-0.5 py-2">
                <a href={`/orders/${order.id}`} className="font-semibold hover:text-signal-700">
                  {clipText(order.description, 90) || 'Заявка без описания'}
                </a>
                <span className="text-xs text-graphite-600">
                  {ORDER_STATUS_LABELS[order.status]} · {order.category?.name ?? 'любая техника'} ·
                  с {msk(order.desiredStartDate)} · {order.contactName ?? order.customer.name}{' '}
                  <PhoneLink phone={order.contactPhone ?? order.customer.phone} />
                </span>
              </li>
            ))}
          </Section>
          <Section title="Брони" count={result.bookings.length}>
            {result.bookings.map((booking) => (
              <BookingRow key={booking.id} booking={booking} />
            ))}
          </Section>
          <Section title="Аккаунты" count={result.users.length}>
            {result.users.map((user) => (
              <li key={user.id} className="py-2">
                {user.name} · {user.email} · <PhoneLink phone={user.phone} />
                <span className="text-xs text-graphite-500"> · {roleLabel(user.role)}</span>
              </li>
            ))}
          </Section>
          <Section title="Компании" count={result.companies.length}>
            {result.companies.map((company) => (
              <li key={company.id} className="py-2">
                {company.name} · <PhoneLink phone={company.phone} />
              </li>
            ))}
          </Section>
        </>
      )}
    </div>
  );
}
