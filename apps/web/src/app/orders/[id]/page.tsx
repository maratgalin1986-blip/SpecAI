import { notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { prisma } from '@specai/database';
import { Card } from '@specai/ui';
import { ORDER_STATUS_LABELS } from '@specai/shared';
import { CancelOrderButton } from '@/components/CancelOrderButton';
import { authOptions } from '@/lib/auth';
import { BidForm } from '@/components/BidForm';
import { AcceptBidButton } from '@/components/AcceptBidButton';
import { formatMoney } from '@/lib/money';
import { isAdminRequest } from '@/lib/admin';
import { SiteConditions } from '@/components/SiteConditions';
import { isProvider, isHouseManager } from '@/lib/fleet';
import { isSafeHttpUrl } from '@/lib/privacy';
import { approvedComments } from '@/lib/commentAccess';
import { CommentForm, CommentList } from '@/components/Comments';
import { customerShortName } from '@/lib/customerPrivacy';

export const dynamic = 'force-dynamic';

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
  // Aggregator: an order is seen by its author, every provider and the admin.
  // Chat contacts are for СпецПласт16 and the admin; a provider sees only its
  // own bids and not the customer's name (competitors' prices stay private).
  const isAdmin = isAdminRequest();
  const canSeeContact = isHouseManager(session?.user) || isAdmin;
  const seesAllBids = isOwner || isAdmin;
  if (!isOwner && !isAdmin && !isProvider(session?.user)) {
    notFound();
  }
  const visibleBids = seesAllBids
    ? order.bids
    : order.bids.filter((bid) => bid.equipment.companyId === session?.user.companyId);

  // A provider sees what other providers wrote about this customer (no name).
  const viewerIsProvider = !isOwner && isProvider(session?.user);
  const customerComments = viewerIsProvider
    ? await approvedComments({ targetUserId: order.customerId }, 10)
    : [];
  const providerHasBid = viewerIsProvider && visibleBids.length > 0;
  // One bid per company: a repeat updates the pending one.
  const ownPendingBid = viewerIsProvider
    ? visibleBids.find((bid) => bid.status === 'PENDING')
    : undefined;

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
              : `от ${seesAllBids ? order.customer.name : customerShortName(order.customer.name)}`}
          </p>
        </div>
        <span className="w-fit shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
          {ORDER_STATUS_LABELS[order.status]}
        </span>
      </div>
      {isOwner && order.status === 'OPEN' && <CancelOrderButton orderId={order.id} />}
      {isOwner && order.status === 'MATCHED' && (
        <p className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Бронь создана — исполнитель подтвердит её и свяжется с вами.{' '}
          <a href="/dashboard#bookings" className="font-semibold underline">
            Мои брони
          </a>
        </p>
      )}

      <Card>
        <h2 className="font-semibold">Описание</h2>
        <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{order.description}</p>
      </Card>

      {/* An async server component, awaited directly so the JSX types do not
          depend on the @types/react version the build happens to resolve. */}
      {await SiteConditions({
        date: order.desiredStartDate,
        location: order.location,
        categoryName: order.category?.name,
      })}

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
              {order.sourceUrl && isSafeHttpUrl(order.sourceUrl) && (
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
          <h2 className="mb-3 text-lg font-semibold">Ваше предложение</h2>
          <Card className="max-w-xl">
            <BidForm
              orderId={order.id}
              existing={
                ownPendingBid
                  ? {
                      price: Number(ownPendingBid.price),
                      currency: ownPendingBid.currency,
                      message: ownPendingBid.message,
                      equipmentId: ownPendingBid.equipmentId,
                    }
                  : undefined
              }
            />
          </Card>
        </section>
      )}

      {viewerIsProvider && order.source === 'SITE' && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Комментарии исполнителей о заказчике</h2>
          <CommentList comments={customerComments} empty="Комментариев пока нет." />
          {providerHasBid && (
            <CommentForm
              compact
              targetUserId={order.customerId}
              label="Оставить комментарий о заказчике"
            />
          )}
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          {seesAllBids
            ? `Предложения исполнителей · ${order.bids.length}`
            : `Ваши предложения (всего по заявке: ${order.bids.length})`}
        </h2>
        {visibleBids.length === 0 ? (
          <p className="text-sm text-slate-600">Пока никто не предложил технику.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {visibleBids.map((bid) => (
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
                {isOwner && bid.status === 'ACCEPTED' && (
                  <CommentForm
                    compact
                    targetCompanyId={bid.equipment.companyId}
                    label="Комментарий об исполнителе"
                  />
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
