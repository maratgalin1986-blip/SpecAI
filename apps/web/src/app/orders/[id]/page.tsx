import { notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { prisma } from '@specai/database';
import { Card } from '@specai/ui';
import { authOptions } from '@/lib/auth';
import { BidForm } from '@/components/BidForm';
import { AcceptBidButton } from '@/components/AcceptBidButton';
import { pluralizeRu } from '@/lib/pluralize';
import { formatMoney } from '@/lib/money';
import { isAdminRequest } from '@/lib/admin';
import { SiteConditions } from '@/components/SiteConditions';
import { isFleetManager } from '@/lib/fleet';

export const dynamic = 'force-dynamic';

const ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING_REVIEW: 'На модерации',
  OPEN: 'Открыта',
  MATCHED: 'Закрыта — техника выбрана',
  CANCELLED: 'Отменена',
};

export default async function OrderDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);

  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: {
      category: true,
      customer: true,
      location: true,
      bids: {
        include: { equipment: { include: { company: true } } },
        orderBy: { price: 'asc' },
      },
    },
  });

  // Imported orders under review are visible only in /admin.
  if (!order || order.status === 'PENDING_REVIEW') {
    notFound();
  }

  const isOwner = session?.user.id === order.customerId;
  const isImported = order.source !== 'SITE';
  // СпецПласт16 is the only executor: an order is seen by its author and the
  // company owner, not published to anyone else.
  const canSeeContact = isFleetManager(session?.user) || isAdminRequest();
  if (!isOwner && !canSeeContact) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Заявка</h1>
          <p className="text-slate-500">
            {order.category?.name ?? 'Любая категория'} ·{' '}
            {order.desiredStartDate.toLocaleDateString('ru-RU')} –{' '}
            {order.desiredEndDate.toLocaleDateString('ru-RU')} ·{' '}
            {isImported
              ? `из ${order.source === 'WHATSAPP' ? 'WhatsApp' : 'Telegram'}${order.sourceChat ? ` (${order.sourceChat})` : ''}`
              : `от ${order.customer.name}`}
          </p>
        </div>
        <span className="w-fit shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
          {ORDER_STATUS_LABEL[order.status]}
        </span>
      </div>

      <Card>
        <h2 className="font-semibold">Описание</h2>
        <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{order.description}</p>
      </Card>

      <SiteConditions
        date={order.desiredStartDate}
        location={order.location}
        categoryName={order.category?.name}
      />

      {isImported && (
        <Card className="border-sky-200 bg-sky-50">
          <h2 className="font-semibold">Заявка из чата</h2>
          {canSeeContact ? (
            <div className="mt-2 flex flex-col gap-1 text-sm">
              {order.contactName && <p>Автор: {order.contactName}</p>}
              {order.contactPhone && (
                <p>
                  Телефон:{' '}
                  <a href={`tel:${order.contactPhone}`} className="font-semibold text-amber-700">
                    {order.contactPhone}
                  </a>
                </p>
              )}
              {order.sourceUrl && (
                <a
                  href={order.sourceUrl}
                  target="_blank"
                  rel="noopener"
                  className="text-sky-700 underline"
                >
                  Открыть исходное сообщение
                </a>
              )}
              {order.rawText && order.rawText !== order.description && (
                <p className="mt-1 whitespace-pre-line text-slate-600">«{order.rawText}»</p>
              )}
            </div>
          ) : null}
        </Card>
      )}

      {order.status === 'OPEN' && !isOwner && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Предложение СпецПласт16</h2>
          <Card className="max-w-xl">
            <BidForm orderId={order.id} />
          </Card>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          {pluralizeRu(order.bids.length, ['предложение', 'предложения', 'предложений'])}
        </h2>
        {order.bids.length === 0 ? (
          <p className="text-sm text-slate-600">Пока никто не предложил технику.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {order.bids.map((bid) => (
              <Card
                key={bid.id}
                className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <div className="min-w-0">
                  <p className="break-words font-medium">
                    {bid.equipment.name} · {bid.equipment.company.name}
                  </p>
                  <p className="text-sm text-slate-500">
                    {formatMoney(bid.price, bid.currency)}
                    {bid.message && <> · {bid.message}</>}
                  </p>
                </div>
                {isOwner && order.status === 'OPEN' && bid.status === 'PENDING' && (
                  <AcceptBidButton bidId={bid.id} />
                )}
                {bid.status === 'ACCEPTED' && (
                  <span className="w-fit shrink-0 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800">
                    Принято
                  </span>
                )}
                {bid.status === 'REJECTED' && (
                  <span className="w-fit shrink-0 rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                    Отклонено
                  </span>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
