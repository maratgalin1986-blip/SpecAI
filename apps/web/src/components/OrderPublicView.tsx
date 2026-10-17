import { ORDER_STATUS_LABELS } from '@specai/shared';
import { OrderBoardCard } from '@/components/OrderBoardCard';
import { DEFAULT_PLACE, toBoardCard, type BoardOrderRow } from '@/lib/orderBoard';
import { orderCardCity, type OrderCardInput } from '@/lib/orderCard';

// /orders/<id> for a visitor without an account — someone who opened a link
// the customer shared or the channel posted. The same card the public board
// shows (lib/orderBoard.ts decides what leaves the server: kind of machine,
// city, dates, «Анна П.», the description with contacts hidden), so the page
// has a link preview (opengraph-image.tsx) instead of a bare sign-in form.
// A provider signs in from the card's button and comes back to bid.

export function OrderPublicView({
  order,
}: {
  order: Omit<BoardOrderRow, 'location'> & {
    status: keyof typeof ORDER_STATUS_LABELS;
    location: OrderCardInput['location'];
  };
}) {
  // The place as a city only (lib/orderCard.ts), like the preview and the
  // channel: never a street, and no home region assumed for an unknown place.
  const card = {
    ...toBoardCard({ ...order, location: null }),
    place: orderCardCity(order.location) ?? DEFAULT_PLACE,
  };
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Заявка на спецтехнику</h1>
        <p className="text-sm text-graphite-600">
          Исполнители со своей техникой присылают цены, заказчик выбирает.
        </p>
      </div>
      {order.status === 'OPEN' ? (
        <div className="max-w-xl">
          <OrderBoardCard card={card} viewer="guest" />
        </div>
      ) : (
        <article className="cab-card flex max-w-xl flex-col gap-2">
          <h2 className="break-words text-base font-bold text-graphite-950">{card.categoryName}</h2>
          <p className="text-sm text-graphite-600">
            {card.place} · {card.dates}
          </p>
          <p className="text-sm font-semibold text-graphite-800">
            {ORDER_STATUS_LABELS[order.status]} — предложения по этой заявке больше не принимаются.
          </p>
          <a href="/orders#board" className="cab-ghost w-fit">
            Открытые заявки
          </a>
        </article>
      )}
      <p className="text-sm text-graphite-700">
        Нужна техника?{' '}
        <a href="/orders" className="font-semibold underline">
          Оставьте свою заявку
        </a>{' '}
        — исполнители рядом пришлют цены, это бесплатно.
      </p>
    </div>
  );
}
