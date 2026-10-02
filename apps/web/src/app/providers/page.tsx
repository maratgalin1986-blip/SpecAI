import type { Metadata } from 'next';
import { prisma } from '@specai/database';
import { ReliabilityBadges } from '@/components/ReliabilityBadges';
import { loadCompanyStats } from '@/lib/companyStats';
import { EMPTY_STATS, reliability } from '@/lib/reliability';
import { providerPath } from '@/lib/providerSeo';
import { SITE } from '@/lib/site';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Исполнители — компании со своей спецтехникой',
  description: `Компании и частники со своей спецтехникой в ${SITE.city} и по Татарстану: парк, база, рейтинг и отзывы. Заявка бесплатно — исполнители сами пришлют цены.`,
  alternates: { canonical: '/providers' },
};

// All provider companies with a published fleet or a base on the map, the
// checked ones first, then by the number of machines.
export default async function ProvidersPage() {
  const companies = await prisma.company
    .findMany({
      where: { isProvider: true },
      select: {
        id: true,
        name: true,
        baseAddress: true,
        verified: true,
        _count: { select: { equipment: { where: { status: { not: 'RETIRED' } } } } },
      },
      take: 300,
    })
    .catch(() => []);
  const stats = await loadCompanyStats(companies.map((company) => company.id)).catch(
    () => new Map(),
  );
  const listed = companies
    .filter((company) => company._count.equipment > 0 || company.baseAddress)
    .sort(
      (a, b) => Number(b.verified) - Number(a.verified) || b._count.equipment - a._count.equipment,
    );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="cab-eyebrow">Исполнители · {SITE.city} и Татарстан</p>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Компании со своей техникой
        </h1>
        <p className="max-w-2xl text-slate-600">
          Оставьте одну заявку — подходящие исполнители пришлют цены. Отметка «Проверен» значит, что
          администратор проверил компанию и документы.
        </p>
        <div className="flex flex-wrap gap-2">
          <a href="/orders#new" className="cab-action">
            Оставить заявку
          </a>
          <a href="/register?type=provider" className="cab-ghost">
            Я исполнитель — подключиться
          </a>
        </div>
      </header>
      {listed.length === 0 ? (
        <p className="text-sm text-slate-600">Список исполнителей скоро появится.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {listed.map((company) => (
            <li key={company.id}>
              <a
                href={providerPath(company.id)}
                className="cab-card flex h-full flex-col gap-2 hover:border-signal-400"
              >
                <span className="break-words text-lg font-bold text-graphite-950">
                  {company.name}
                </span>
                <span className="text-sm text-graphite-600">
                  Техники: {company._count.equipment}
                  {company.baseAddress ? ` · ${company.baseAddress}` : ''}
                </span>
                <ReliabilityBadges value={reliability(stats.get(company.id) ?? EMPTY_STATS)} />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
