import { notFound } from 'next/navigation';
import { prisma } from '@specai/database';
import { Card, StatusBadge } from '@specai/ui';
import type { Metadata } from 'next';
import { BookingForm } from '@/components/BookingForm';
import { CallbackForm } from '@/components/CallbackForm';
import { pluralizeRu } from '@/lib/pluralize';
import { formatMoney } from '@/lib/money';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const item = await prisma.equipment.findUnique({
    where: { id: params.id },
    select: { name: true, description: true, dailyRate: true, currency: true },
  });
  if (!item) return { title: 'Техника не найдена' };
  return {
    title: `${item.name} — аренда от ${formatMoney(item.dailyRate, item.currency)}/сутки`,
    description: item.description ?? `Аренда: ${item.name}`,
  };
}

export default async function EquipmentDetailPage({ params }: { params: { id: string } }) {
  const item = await prisma.equipment.findUnique({
    where: { id: params.id },
    include: {
      category: true,
      location: true,
      company: true,
      reviews: { include: { author: true }, orderBy: { createdAt: 'desc' } },
    },
  });

  if (!item) {
    notFound();
  }

  const specs = (item.specs as Record<string, unknown> | null) ?? {};
  const averageRating = item.reviews.length
    ? item.reviews.reduce((sum, review) => sum + review.rating, 0) / item.reviews.length
    : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold break-words">{item.name}</h1>
          <p className="text-slate-500">
            {item.category.name} · Поставщик: {item.company.name}
            {averageRating !== null && (
              <>
                {' '}
                · ★ {averageRating.toFixed(1)} (
                {pluralizeRu(item.reviews.length, ['отзыв', 'отзыва', 'отзывов'])})
              </>
            )}
          </p>
        </div>
        <div className="shrink-0">
          <StatusBadge status={item.status} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          {item.imageUrls.length > 0 && (
            <div className="mb-4 flex flex-col gap-2">
              <img
                src={item.imageUrls[0]}
                alt={item.name}
                className="max-h-96 w-full rounded-md object-cover"
              />
              {item.imageUrls.length > 1 && (
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {item.imageUrls.slice(1).map((url, index) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer">
                      <img
                        src={url}
                        alt={`${item.name} — фото ${index + 2}`}
                        className="h-20 w-full rounded object-cover"
                      />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          <h2 className="font-semibold">Описание</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-slate-600">
            {item.description ?? 'Описание не указано.'}
          </p>

          {Object.keys(specs).length > 0 && (
            <>
              <h2 className="mt-6 font-semibold">Характеристики</h2>
              <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 break-words text-sm sm:grid-cols-2">
                {Object.entries(specs).map(([key, value]) => (
                  <div key={key} className="contents">
                    <dt className="text-slate-500">{key}</dt>
                    <dd>{String(value)}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}

          {item.reviews.length > 0 && (
            <>
              <h2 className="mt-6 font-semibold">Отзывы</h2>
              <div className="mt-2 flex flex-col gap-3">
                {item.reviews.map((review) => (
                  <div key={review.id} className="border-t border-slate-100 pt-2 text-sm">
                    <p className="font-medium">
                      {'★'.repeat(review.rating)}
                      {'☆'.repeat(5 - review.rating)}{' '}
                      <span className="font-normal text-slate-500">{review.author.name}</span>
                    </p>
                    {review.comment && <p className="mt-1 text-slate-600">{review.comment}</p>}
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card className="flex h-fit flex-col gap-3 lg:sticky lg:top-6">
          <p className="text-2xl font-semibold">
            {formatMoney(item.dailyRate, item.currency)}
            <span className="text-sm font-normal text-slate-500">/сутки</span>
          </p>
          {item.weeklyRate && (
            <p className="text-sm text-slate-600">
              {formatMoney(item.weeklyRate, item.currency)}/неделя
            </p>
          )}
          {item.monthlyRate && (
            <p className="text-sm text-slate-600">
              {formatMoney(item.monthlyRate, item.currency)}/месяц
            </p>
          )}
          {item.location && (
            <p className="text-sm text-slate-500">
              {item.location.city}, {item.location.country}
            </p>
          )}

          {item.status === 'AVAILABLE' && (
            <div className="mt-2 border-t border-slate-200 pt-3">
              <BookingForm
                equipmentId={item.id}
                dailyRate={Number(item.dailyRate)}
                currency={item.currency}
              />
            </div>
          )}

          <div className="mt-2 border-t border-slate-200 pt-3">
            <CallbackForm
              source={`equipment:${item.id}`}
              defaultMessage={`Интересует: ${item.name}`}
              title="Заказать по телефону"
              subtitle="Оставьте номер — уточним даты, доставку и цену."
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
