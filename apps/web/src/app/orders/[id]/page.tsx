import { notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { prisma } from '@specai/database';
import { Card } from '@specai/ui';
import { authOptions } from '@/lib/auth';
import { BidForm } from '@/components/BidForm';
import { AcceptBidButton } from '@/components/AcceptBidButton';
import { pluralizeRu } from '@/lib/pluralize';

export const dynamic = 'force-dynamic';

const ORDER_STATUS_LABEL: Record<string, string> = {
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
      bids: {
        include: { equipment: { include: { company: true } } },
        orderBy: { price: 'asc' },
      },
    },
  });

  if (!order) {
    notFound();
  }

  const isOwner = session?.user.id === order.customerId;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Заявка</h1>
          <p className="text-slate-500">
            {order.category?.name ?? 'Любая категория'} ·{' '}
            {order.desiredStartDate.toLocaleDateString('ru-RU')} –{' '}
            {order.desiredEndDate.toLocaleDateString('ru-RU')} · от {order.customer.name}
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
          {ORDER_STATUS_LABEL[order.status]}
        </span>
      </div>

      <Card>
        <h2 className="font-semibold">Описание</h2>
        <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{order.description}</p>
      </Card>

      {order.status === 'OPEN' && !isOwner && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Предложить свою технику</h2>
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
              <Card key={bid.id} className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium">
                    {bid.equipment.name} · {bid.equipment.company.name}
                  </p>
                  <p className="text-sm text-slate-500">
                    ${bid.price.toString()} {bid.currency}
                    {bid.message && <> · {bid.message}</>}
                  </p>
                </div>
                {isOwner && order.status === 'OPEN' && bid.status === 'PENDING' && (
                  <AcceptBidButton bidId={bid.id} />
                )}
                {bid.status === 'ACCEPTED' && (
                  <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800">
                    Принято
                  </span>
                )}
                {bid.status === 'REJECTED' && (
                  <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
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
