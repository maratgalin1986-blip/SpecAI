import { notFound } from 'next/navigation';
import { prisma } from '@specai/database';
import type { Metadata } from 'next';
import { AvailabilityChip } from '@/components/AvailabilityChip';
import { BookingForm } from '@/components/BookingForm';
import { EquipmentCard, categoryIcon } from '@/components/EquipmentCard';
import { EstimateBox } from '@/components/EstimateBox';
import { Icon } from '@/components/Icon';
import { MachineGallery } from '@/components/MachineGallery';
import { modelPhotosOf } from '@/lib/modelPhotos';
import { MachinePhoto } from '@/components/MachinePhoto';
import { MachineAmbience } from '@/components/MachineAmbience';
import {
  customerRates,
  headlinePrices,
  keySpecs,
  machineTypeOf,
  numericSpec,
  specChip,
  specEntries,
  taskGroupOf,
} from '@/lib/equipmentCatalog';
import { formatMoney, formatRate } from '@/lib/money';
import { pluralizeRu } from '@/lib/pluralize';
import { SITE } from '@/lib/site';
import { HOUSE_FIRST_ORDER, PUBLISHED_FLEET, PUBLIC_FLEET, isHouseEquipment } from '@/lib/fleet';
import { isDisplayableImage } from '@/lib/providerMap';
import { shortAuthorName } from '@/lib/comments';
import { maskContactsAndLinks } from '@/lib/privacy';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { approvedComments, commentAccessError } from '@/lib/commentAccess';
import { CommentForm, CommentList } from '@/components/Comments';
import { ShareButtons } from '@/components/ShareButtons';
import { ReliabilityBadges } from '@/components/ReliabilityBadges';
import { companyReliability } from '@/lib/companyStats';
import { providerPath } from '@/lib/providerSeo';
import { siteUrl } from '@/lib/siteUrl';
import { HAMMER_RATE } from '@/lib/machineWorks';

export const dynamic = 'force-dynamic';

const STATUS_NOTE: Record<string, string> = {
  RENTED: 'Сейчас эта машина в аренде — оставьте телефон, подскажем ближайшую дату.',
  IN_MAINTENANCE: 'Сейчас машина на обслуживании — оставьте телефон, подскажем, когда освободится.',
  RETIRED: 'Машина больше не сдаётся — оставьте телефон, подберём замену.',
};

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const item = await prisma.equipment.findFirst({
    where: { id: params.id, ...PUBLIC_FLEET },
    select: {
      name: true,
      description: true,
      dailyRate: true,
      hourlyRate: true,
      currency: true,
      status: true,
      imageUrls: true,
      companyId: true,
      category: { select: { name: true } },
      company: { select: { name: true } },
    },
  });
  if (!item) return { title: 'Техника не найдена' };
  const rate = formatRate({
    ...customerRates({ ...item, categoryName: item.category.name }),
    currency: item.currency,
  });
  const title = `${item.name} — аренда ${rate.price}${rate.unit}`;
  const description = maskContactsAndLinks(
    item.description ?? `Аренда: ${item.name}, ${item.category.name.toLowerCase()} с машинистом`,
  ).slice(0, 200);
  const photo = item.imageUrls.find(isDisplayableImage);
  const url = `/equipment/${params.id}`;
  return {
    title,
    description,
    // A retired machine keeps its page for old links but leaves the search index.
    robots: item.status === 'RETIRED' ? { index: false } : undefined,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      locale: 'ru_RU',
      siteName: SITE.name,
      url,
      title,
      description: `${description} · исполнитель: ${item.company.name}`.slice(0, 300),
      ...(photo ? { images: [{ url: photo, alt: item.name }] } : {}),
    },
    twitter: {
      card: photo ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(photo ? { images: [photo] } : {}),
    },
  };
}

export default async function EquipmentDetailPage({ params }: { params: { id: string } }) {
  const item = await prisma.equipment.findUnique({
    where: { id: params.id },
    include: {
      category: true,
      location: true,
      company: true,
      reviews: {
        include: { author: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  // Machinery of any provider company has a public page (the aggregator).
  if (!item || !item.company?.isProvider) {
    notFound();
  }

  const session = await getServerSession(authOptions);
  const commentTarget = { targetCompanyId: item.companyId };
  const [comments, commentDenied, trust] = await Promise.all([
    approvedComments(commentTarget),
    session?.user ? commentAccessError(session.user, commentTarget) : Promise.resolve(null),
    companyReliability(item.companyId),
  ]);
  const canComment = Boolean(session?.user) && commentDenied === null;

  const specs = item.specs;
  const specRows = specEntries(specs);
  const chips = keySpecs(specs, 4).map(specChip);
  const rates = customerRates({ ...item, categoryName: item.category.name });
  const { hour, shift } = headlinePrices(rates);
  // Machines sold as «с гидромолотом» without a hammer price in their specs
  // still get the owner's hammer rate.
  const hammerRate =
    numericSpec(specs, /гидромолот.*₽/i) ??
    (/гидромолот/i.test(item.name) ? HAMMER_RATE : undefined);
  const illustration = machineTypeOf(item.category.name, item.name);
  const ownFleet = isHouseEquipment(item);
  const executor = ownFleet
    ? 'Парк СпецПласт16 · машинист в штате'
    : `${item.company.name} · с машинистом`;
  const photos = item.imageUrls.filter(isDisplayableImage);
  // No own photo yet: photos of the same model, labelled as such.
  const modelPhotos = photos.length ? [] : modelPhotosOf(item.name);
  const averageRating = item.reviews.length
    ? item.reviews.reduce((sum, review) => sum + review.rating, 0) / item.reviews.length
    : null;

  // Same category first; if it has nothing else, the same task group.
  let similar = await prisma.equipment.findMany({
    where: { ...PUBLISHED_FLEET, categoryId: item.categoryId, id: { not: item.id } },
    include: { category: true, location: true, company: { select: { name: true } } },
    orderBy: [HOUSE_FIRST_ORDER, { status: 'asc' }, { createdAt: 'desc' }],
    take: 3,
  });
  if (similar.length === 0) {
    const group = taskGroupOf(item.category.name);
    const categories = await prisma.equipmentCategory.findMany({
      select: { id: true, name: true },
    });
    const groupIds = categories.filter((c) => taskGroupOf(c.name) === group).map((c) => c.id);
    similar = await prisma.equipment.findMany({
      where: { ...PUBLISHED_FLEET, categoryId: { in: groupIds }, id: { not: item.id } },
      include: { category: true, location: true, company: { select: { name: true } } },
      orderBy: [HOUSE_FIRST_ORDER, { status: 'asc' }, { createdAt: 'desc' }],
      take: 3,
    });
  }

  const facts: { label: string; value: string }[] = [
    { label: 'Категория', value: item.category.name },
    ...(item.location
      ? [{ label: 'Местоположение', value: `${item.location.city}, ${item.location.country}` }]
      : []),
    { label: 'Кто работает', value: executor },
    ...(item.make || item.model
      ? [{ label: 'Марка и модель', value: [item.make, item.model].filter(Boolean).join(' ') }]
      : []),
    ...(item.year ? [{ label: 'Год выпуска', value: String(item.year) }] : []),
    ...(hour !== null ? [{ label: 'Цена за час', value: formatMoney(hour, item.currency) }] : []),
    ...(shift !== null
      ? [{ label: 'Цена за смену 8 ч', value: formatMoney(shift, item.currency) }]
      : []),
    ...(rates.weeklyRate
      ? [{ label: 'Цена за неделю', value: formatMoney(rates.weeklyRate, item.currency) }]
      : []),
    ...(rates.monthlyRate
      ? [{ label: 'Цена за месяц', value: formatMoney(rates.monthlyRate, item.currency) }]
      : []),
    ...specRows.map((row) => ({
      label: row.label,
      value: row.unit ? `${row.value} ${row.unit}` : row.value,
    })),
  ];

  return (
    <div className="flex flex-col gap-16">
      {illustration && <MachineAmbience type={illustration} />}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-10">
        {/* Title, chips and gallery */}
        <div className="flex min-w-0 flex-col gap-6">
          <nav aria-label="Навигация" className="eyebrow text-[0.65rem] text-slate-500">
            <a href="/equipment" className="hover:text-slate-900">
              Каталог
            </a>
            <span className="mx-2 text-slate-300">/</span>
            <a href={`/equipment?category=${item.categoryId}`} className="hover:text-slate-900">
              {item.category.name}
            </a>
          </nav>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <AvailabilityChip status={item.status} />
              {item.location && (
                <span className="eyebrow text-[0.65rem] text-slate-500">{item.location.city}</span>
              )}
            </div>
            <h1
              className="mt-3 break-words text-3xl font-extrabold tracking-[-0.03em] sm:text-5xl"
              style={{ viewTransitionName: 'machine-title' }}
            >
              {item.name}
            </h1>
            <p className="mt-3 text-sm text-slate-500">
              {item.category.name} · {executor}
              {averageRating !== null && (
                <>
                  {' '}
                  · ★ {averageRating.toFixed(1)} (
                  {pluralizeRu(item.reviews.length, ['отзыв', 'отзыва', 'отзывов'])})
                </>
              )}
            </p>
          </div>

          {(chips.length > 0 || hour !== null || shift !== null) && (
            <ul className="flex flex-wrap gap-2" aria-label="Коротко о машине">
              {hour !== null && (
                <li
                  className="rounded-full bg-slate-950 px-3.5 py-1.5 font-mono text-sm font-semibold text-amber-400"
                  style={{ viewTransitionName: 'machine-price' }}
                >
                  {formatMoney(hour, item.currency)}/ч
                </li>
              )}
              {shift !== null && (
                <li className="rounded-full bg-slate-950 px-3.5 py-1.5 font-mono text-sm font-semibold text-white">
                  {formatMoney(shift, item.currency)}/смена
                </li>
              )}
              {chips.map((chip) => (
                <li
                  key={chip}
                  className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700"
                >
                  {chip}
                </li>
              ))}
            </ul>
          )}

          {photos.length > 0 ? (
            <div style={{ viewTransitionName: 'machine-photo' }}>
              <MachineGallery images={photos} name={item.name} />
            </div>
          ) : modelPhotos.length > 0 ? (
            <figure style={{ viewTransitionName: 'machine-photo' }}>
              <MachineGallery images={modelPhotos} name={item.name} />
              <figcaption className="mt-2 text-xs text-slate-500">
                Фото этой модели из открытых источников — не наша машина
              </figcaption>
            </figure>
          ) : illustration ? (
            <figure style={{ viewTransitionName: 'machine-photo' }}>
              <div className="relative aspect-[16/9] overflow-hidden rounded-3xl bg-slate-950">
                <MachinePhoto
                  type={illustration}
                  alt={item.category.name}
                  priority
                  sizes="(min-width: 1024px) 720px, 100vw"
                  className="machine-hero-photo absolute inset-0"
                />
              </div>
              <figcaption className="mt-2 text-xs text-slate-500">
                Фото для примера — не эта машина
              </figcaption>
            </figure>
          ) : (
            <div className="relative flex aspect-[16/9] items-center justify-center overflow-hidden rounded-3xl bg-slate-950 bg-[radial-gradient(ellipse_at_50%_35%,rgba(245,158,11,0.16),transparent_62%)]">
              <div
                className="absolute inset-0 opacity-[0.1] [background-image:linear-gradient(rgba(255,255,255,.5)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.5)_1px,transparent_1px)] [background-size:32px_32px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]"
                aria-hidden
              />
              <Icon
                name={categoryIcon(item.category.name)}
                className="relative h-28 w-28 text-amber-400"
              />
              <span className="eyebrow absolute left-4 top-4 text-[0.65rem] text-amber-400">
                {item.category.name}
              </span>
            </div>
          )}
        </div>

        {/* Estimate: sticky on desktop, right after the gallery on phones */}
        <aside
          id="estimate"
          className="scroll-mt-24 lg:col-start-2 lg:row-span-2 lg:row-start-1"
          aria-label="Расчёт и заказ"
        >
          <div className="flex flex-col gap-4 lg:sticky lg:top-24">
            <EstimateBox
              equipmentId={item.id}
              equipmentName={item.name}
              hourlyRate={hour}
              shiftRate={shift}
              hammerRate={hammerRate}
              showVatNote={ownFleet}
              statusNote={STATUS_NOTE[item.status]}
            />
            <div className="cab-card flex flex-col gap-2">
              <p className="text-xs text-graphite-500">Исполнитель</p>
              <a
                href={providerPath(item.companyId)}
                className="break-words font-bold text-graphite-950 hover:text-signal-700 hover:underline"
              >
                {executor}
              </a>
              <ReliabilityBadges value={trust} />
            </div>
            {item.status === 'AVAILABLE' && (
              <details className="group rounded-3xl border border-slate-200 bg-white px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                  Забронировать на даты
                  <Icon
                    name="plus"
                    className="h-4 w-4 text-slate-500 transition group-open:rotate-45"
                  />
                </summary>
                <div className="mt-4">
                  <BookingForm
                    equipmentId={item.id}
                    dailyRate={rates.dailyRate}
                    currency={item.currency}
                  />
                </div>
              </details>
            )}
          </div>
        </aside>

        {/* Specs, description, reviews */}
        <div className="flex min-w-0 flex-col gap-10 lg:col-start-1 lg:row-start-2">
          <section>
            <div className="eyebrow text-amber-700">Характеристики</div>
            <dl className="mt-4 grid overflow-hidden rounded-3xl border border-slate-200 bg-white sm:grid-cols-2">
              {facts.map((fact, index) => (
                <div
                  key={`${fact.label}-${index}`}
                  className="flex items-baseline justify-between gap-4 border-slate-200 px-5 py-3.5 text-sm [&:not(:last-child)]:border-b sm:odd:border-r sm:[&:nth-last-child(2):nth-child(odd)]:border-b-0"
                >
                  <dt className="text-slate-500">{fact.label}</dt>
                  <dd className="text-right font-medium text-slate-900">{fact.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section>
            <div className="eyebrow text-amber-700">Описание</div>
            <p className="mt-4 max-w-3xl whitespace-pre-line leading-relaxed text-slate-700">
              {item.description ?? 'Описание не указано — уточните детали у менеджера.'}
            </p>
          </section>

          {item.reviews.length > 0 && (
            <section>
              <div className="eyebrow text-amber-700">Отзывы</div>
              <div className="mt-4 flex flex-col divide-y divide-slate-200 rounded-3xl border border-slate-200 bg-white">
                {item.reviews.map((review) => (
                  <div key={review.id} className="px-5 py-4 text-sm">
                    <p className="font-medium">
                      <span className="text-amber-500">
                        {'★'.repeat(review.rating)}
                        {'☆'.repeat(5 - review.rating)}
                      </span>{' '}
                      <span className="font-normal text-slate-500">
                        {shortAuthorName(review.author.name)}
                      </span>
                    </p>
                    {review.comment && review.textStatus === 'APPROVED' && (
                      <p className="mt-1 text-slate-700">{maskContactsAndLinks(review.comment)}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          <ShareButtons
            url={`${siteUrl()}/equipment/${item.id}`}
            text={`${item.name} — аренда с машинистом`}
            label="Поделиться техникой"
          />

          <section id="comments" className="scroll-mt-24">
            <div className="eyebrow text-amber-700">Комментарии заказчиков</div>
            <p className="mt-2 text-sm text-slate-500">
              О работе {ownFleet ? SITE.name : `«${item.company.name}»`}. Публикуются после
              проверки.
            </p>
            <div className="mt-4 flex flex-col gap-4">
              <CommentList comments={comments} empty="Комментариев пока нет." />
              {canComment ? (
                <CommentForm
                  targetCompanyId={item.companyId}
                  label="Оставить комментарий о работе"
                  compact={comments.length > 0}
                />
              ) : (
                <p className="text-xs text-slate-500">
                  {session?.user ? (
                    'Комментарий можно оставить после брони этой техники или предложения исполнителя по вашей заявке.'
                  ) : (
                    <>
                      <a
                        href={`/login?callbackUrl=/equipment/${item.id}`}
                        className="font-medium text-amber-700 underline"
                      >
                        Войдите
                      </a>
                      , чтобы оставить комментарий после брони.
                    </>
                  )}
                </p>
              )}
            </div>
          </section>
        </div>
      </div>

      {similar.length > 0 && (
        <section>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="eyebrow text-amber-700">Ещё в каталоге</div>
              <h2 className="mt-3 text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">
                Похожая техника
              </h2>
            </div>
            <a
              href={`/equipment?category=${item.categoryId}`}
              className="group inline-flex items-center gap-2 rounded-full border border-slate-300 px-5 py-2.5 text-sm font-semibold transition hover:border-slate-900"
            >
              Все: {item.category.name}
              <Icon name="arrow" className="h-4 w-4 transition group-hover:translate-x-1" />
            </a>
          </div>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {similar.map((other) => (
              <EquipmentCard
                key={other.id}
                item={{ ...other, imageUrls: other.imageUrls.filter(isDisplayableImage) }}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
