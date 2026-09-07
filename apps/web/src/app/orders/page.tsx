import { prisma } from '@specai/database';
import { Card } from '@specai/ui';
import { NewOrderForm } from '@/components/NewOrderForm';

export const dynamic = 'force-dynamic';

export default async function OrdersPage() {
  const orders = await prisma.order.findMany({
    where: { status: 'OPEN' },
    include: { category: true, customer: true, bids: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">Заявки на технику</h1>
        <p className="mt-1 text-slate-600">
          Опубликуйте, что вам нужно — поставщики поблизости предложат свою технику и цену. Похоже
          на заказ такси, только для спецтехники.
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Новая заявка</h2>
        <Card className="max-w-xl">
          <NewOrderForm />
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Открытые заявки</h2>
        {orders.length === 0 ? (
          <p className="text-sm text-slate-600">Открытых заявок пока нет.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {orders.map((order) => (
              <a key={order.id} href={`/orders/${order.id}`}>
                <Card className="flex h-full flex-col gap-2 hover:border-amber-400">
                  <p className="font-medium">{order.description}</p>
                  <p className="text-sm text-slate-500">
                    {order.category?.name ?? 'Любая категория'} ·{' '}
                    {order.desiredStartDate.toLocaleDateString('ru-RU')} –{' '}
                    {order.desiredEndDate.toLocaleDateString('ru-RU')}
                  </p>
                  <p className="text-sm text-slate-500">
                    {order.bids.length > 0
                      ? `Предложений: ${order.bids.length}`
                      : 'Пока нет предложений'}
                  </p>
                </Card>
              </a>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
