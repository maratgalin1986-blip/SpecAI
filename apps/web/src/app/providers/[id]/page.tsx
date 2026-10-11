import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@specai/database';
import { EquipmentCard } from '@/components/EquipmentCard';
import { ReliabilityBadges } from '@/components/ReliabilityBadges';
import { ShareButtons } from '@/components/ShareButtons';
import { CommentList } from '@/components/Comments';
import { approvedComments } from '@/lib/commentAccess';
import { companyReliability } from '@/lib/companyStats';
import { isDisplayableImage } from '@/lib/providerMap';
import { maskContactsAndLinks } from '@/lib/privacy';
import { shortAuthorName } from '@/lib/comments';
import {
  jsonLdScript,
  providerJsonLd,
  providerMetaDescription,
  providerPath,
} from '@/lib/providerSeo';
import { SITE } from '@/lib/site';
import { siteUrl } from '@/lib/siteUrl';
import { HOUSE_COMPANY_ID } from '@/lib/fleet';

export const dynamic = 'force-dynamic';

// The public page of a provider company: fleet, base, trust signals, approved
// reviews and comments, share buttons and a LocalBusiness card for search
// engines. Contacts are not here on purpose: they open after a confirmed
// booking (CLAUDE.md), the page leads to an order instead.

async function loadProvider(id: string) {
  if (!/^[\w-]{1,64}$/.test(id)) return null;
  return prisma.company.findFirst({
    where: { id, isProvider: true },
    select: {
      id: true,
      name: true,
      description: true,
      baseAddress: true,
      baseLat: true,
      baseLon: true,
      pinImageUrl: true,
      pinNote: true,
      createdAt: true,
      equipment: {
        where: { status: { not: 'RETIRED' } },
        include: { category: true, location: true },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        take: 60,
      },
      reviews: {
        include: { author: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
    },
  });
}

function seoInput(provider: NonNullable<Awaited<ReturnType<typeof loadProvider>>>) {
  const ratingCount = provider.reviews.length;
  const rating = ratingCount
    ? Math.round(
        (provider.reviews.reduce((sum, review) => sum + review.rating, 0) / ratingCount) * 10,
      ) / 10
    : null;
  return {
    id: provider.id,
    name: provider.name,
    description: provider.description ? maskContactsAndLinks(provider.description) : null,
    baseAddress: provider.baseAddress,
    baseLat: provider.baseLat,
    baseLon: provider.baseLon,
    rating,
    ratingCount,
    machines: provider.equipment.map((item) => ({ name: item.name, category: item.category.name })),
    city: SITE.city,
    region: SITE.region,
  };
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const provider = await loadProvider(params.id).catch(() => null);
  if (!provider) return { title: 'Исполнитель не найден', robots: { index: false } };
  const description = providerMetaDescription(seoInput(provider));
  const title = `${provider.name} — аренда спецтехники`;
  const photo =
    [provider.pinImageUrl, ...provider.equipment.flatMap((item) => item.imageUrls)].find(
      (url): url is string => Boolean(url) && isDisplayableImage(url as string),
    ) ?? null;
  return {
    title,
    description,
    alternates: { canonical: providerPath(provider.id) },
    openGraph: {
      type: 'website',
      locale: 'ru_RU',
      siteName: SITE.name,
      title,
      description,
      url: providerPath(provider.id),
      ...(photo ? { images: [{ url: photo, alt: provider.name }] } : {}),
    },
    twitter: {
      card: photo ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(photo ? { images: [photo] } : {}),
    },
  };
}

export default async function ProviderPublicPage({ params }: { params: { id: string } }) {
  const provider = await loadProvider(params.id);
  if (!provider) notFound();

  const [trust, comments] = await Promise.all([
    companyReliability(provider.id),
    approvedComments({ targetCompanyId: provider.id }, 20),
  ]);
  const seo = seoInput(provider);
  const pageUrl = `${siteUrl()}${providerPath(provider.id)}`;
  const reviewsWithText = provider.reviews.filter(
    (review) => review.comment && review.textStatus === 'APPROVED',
  );
  const categories = [...new Set(provider.equipment.map((item) => item.category.name))];
  const house = provider.id === HOUSE_COMPANY_ID;

  return (
    <div className="flex flex-col gap-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(providerJsonLd(seo, siteUrl())) }}
      />

      <nav aria-label="Навигация" className="eyebrow text-[0.65rem] text-slate-500">
        <a href="/providers" className="hover:text-slate-900">
          Исполнители
        </a>
        <span className="mx-2 text-slate-300">/</span>
        {provider.name}
      </nav>

      <header className="cab-dark flex flex-col gap-4 sm:p-8">
        <p className="cab-eyebrow text-signal-300">
          {house ? 'Собственный парк СпецПласт16' : 'Исполнитель на СпецПласт16'}
        </p>
        <h1 className="break-words text-3xl font-extrabold tracking-tight sm:text-5xl">
          {provider.name}
        </h1>
        <ReliabilityBadges value={trust} className="[&_.cab-chip]:border-graphite-700" />
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-graphite-300">База</dt>
            <dd className="font-semibold">{provider.baseAddress ?? SITE.city}</dd>
          </div>
          <div>
            <dt className="text-graphite-300">Техника</dt>
            <dd className="font-semibold">
              {provider.equipment.length > 0
                ? `${provider.equipment.length} ед. · ${categories.slice(0, 3).join(', ')}`
                : 'пока не добавлена'}
            </dd>
          </div>
          <div>
            <dt className="text-graphite-300">На сервисе</dt>
            <dd className="font-semibold">
              с {provider.createdAt.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
            </dd>
          </div>
        </dl>
        {provider.pinNote && (
          <p className="w-fit rounded-xl bg-graphite-800 px-3 py-2 text-sm text-graphite-100">
            {maskContactsAndLinks(provider.pinNote)}
          </p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <a href={`/orders?provider=${encodeURIComponent(provider.id)}`} className="cab-action">
            Оставить заявку исполнителю
          </a>
          <a
            href="/map"
            className="cab-ghost border-graphite-600 bg-transparent text-white hover:border-white"
          >
            Показать на карте
          </a>
        </div>
        <p className="text-xs text-graphite-300">
          Телефон исполнителя откроется после подтверждения брони — так ваш номер не попадёт в чужие
          базы. Сервис бесплатный.
        </p>
      </header>

      {seo.description && (
        <section className="cab-card">
          <h2 className="cab-eyebrow">О компании</h2>
          <p className="mt-2 whitespace-pre-line text-graphite-800">{seo.description}</p>
        </section>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-extrabold tracking-tight">Техника исполнителя</h2>
        {provider.equipment.length === 0 ? (
          <p className="text-sm text-slate-600">
            Исполнитель ещё не добавил технику — оставьте заявку, он ответит ценой.
          </p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {provider.equipment.map((item) => (
              <EquipmentCard
                key={item.id}
                item={{ ...item, imageUrls: item.imageUrls.filter(isDisplayableImage) }}
              />
            ))}
          </div>
        )}
      </section>

      {reviewsWithText.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">Отзывы после выполненных заказов</h2>
          <ul className="flex flex-col divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
            {reviewsWithText.map((review) => (
              <li key={review.id} className="px-5 py-4 text-sm">
                <p>
                  <span className="text-signal-600">
                    {'★'.repeat(review.rating)}
                    {'☆'.repeat(5 - review.rating)}
                  </span>{' '}
                  <span className="text-slate-500">{shortAuthorName(review.author.name)}</span>
                </p>
                <p className="mt-1 text-slate-700">{maskContactsAndLinks(review.comment ?? '')}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Комментарии заказчиков</h2>
        <CommentList comments={comments} empty="Комментариев пока нет." />
        <p className="text-xs text-slate-500">
          Оставить комментарий можно после брони или предложения по вашей заявке. Публикуются после
          проверки.
        </p>
      </section>

      <section className="cab-card">
        <ShareButtons url={pageUrl} text={`${provider.name} — аренда спецтехники с машинистом`} />
      </section>
    </div>
  );
}
