import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@specai/database';
import { Card } from '@specai/ui';
import { adminGate } from '@/components/admin/AdminGate';
import { AdminPageHeader, AdminTag, StatTile, type TagTone } from '@/components/admin/AdminUi';
import { OfficeClientControls } from '@/components/admin/OfficeClientControls';
import { OfficePayDetailsForm } from '@/components/admin/OfficePayDetailsForm';
import { PhoneLink } from '@/components/admin/PhoneLink';
import {
  BILLING_STATUS_TITLES,
  EXPIRING_DAYS,
  billingStatus,
  billingSummary,
  byBillingUrgency,
  clientPackage,
  clientPrices,
  formatDayMsk,
  type BillingStatus,
} from '@/lib/office/billing';
import { nicheTitle } from '@/lib/office/niches';
import { officePrices } from '@/lib/office/prices';
import { PAY_DETAILS_MAX, readOfficeSettings } from '@/lib/office/settings';
import { rub } from '@/lib/prices';
import { siteUrl } from '@/lib/siteUrl';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Клиенты: сайты', robots: { index: false } };

/** Опубликованных сайтов на странице. */
const CLIENTS_SHOWN = 500;

const STATUS_TONES: Record<BillingStatus, TagTone> = {
  unpaid: 'quiet',
  active: 'green',
  expiring: 'warn',
  overdue: 'red',
};

/**
 * Клиенты «Сайтов под ключ» (S6): опубликованные сайты, их цены и оплата, выручка в месяц и
 * просрочки; ссылка на счёт для клиента и реквизиты, которые он там увидит. Онлайн-оплаты нет —
 * владелец отмечает оплату сам; сайты при просрочке не отключаются.
 */
export default async function AdminOfficeClientsPage() {
  const gate = await adminGate();
  if (gate) return gate;
  const now = new Date();
  const base = siteUrl();

  const [prices, settings, rows] = await Promise.all([
    officePrices(),
    readOfficeSettings(),
    prisma.prospect.findMany({
      where: { kind: 'site', status: 'PUBLISHED' },
      orderBy: { publishedAt: 'desc' },
      take: CLIENTS_SHOWN,
      select: {
        id: true,
        slug: true,
        token: true,
        name: true,
        phone: true,
        city: true,
        niche: true,
        domain: true,
        publishedAt: true,
        setupPrice: true,
        monthlyPrice: true,
        setupPaidAt: true,
        paidUntil: true,
      },
    }),
  ]);

  const clients = byBillingUrgency(rows, now);
  const summary = billingSummary(rows, prices, now);

  return (
    <div className="flex flex-col gap-5">
      <AdminPageHeader
        title="Клиенты: сайты"
        text="Опубликованные сайты, цены и оплата. Онлайн-оплаты нет: клиент платит по счёту, вы отмечаете оплату здесь. Сайт при просрочке не отключается."
      >
        <Link href="/admin/office" className="cab-action">
          Назад в офис
        </Link>
      </AdminPageHeader>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <StatTile label="Клиентов" value={summary.clients} />
        <StatTile label="Оплатили" value={summary.paid} hint="сайт оплачен" />
        <StatTile
          label="Выручка в месяц"
          value={`${rub(summary.revenue)} ₽`}
          hint="поддержка с действующей оплатой"
          tone="dark"
        />
        <StatTile label="Истекает" value={summary.expiring} hint={`за ${EXPIRING_DAYS} дней`} />
        <StatTile label="Просрочено" value={summary.overdue} />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-graphite-950">
          Сайты <span className="font-mono text-base text-graphite-500">{clients.length}</span>
        </h2>
        {clients.length === 0 ? (
          <Card>
            Опубликованных сайтов пока нет: когда компания согласится, отметьте «Согласился» в офисе
            — сайт появится здесь.
          </Card>
        ) : (
          clients.map((client) => {
            const pkg = clientPackage(client, prices);
            const own = clientPrices(client, pkg);
            const status = billingStatus(client, now);
            const sitePath = `/s/${client.slug}`;
            const invoiceUrl = `${base}/oplata/${client.token}`;
            return (
              <Card
                key={client.id}
                className={`flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between ${
                  status === 'overdue'
                    ? 'border-red-300'
                    : status === 'expiring'
                      ? 'border-amber-300'
                      : ''
                }`}
              >
                <div className="min-w-0 text-sm lg:w-2/5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <a
                      href={sitePath}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-signal-700 hover:underline"
                    >
                      {client.name}
                    </a>
                    <AdminTag tone={STATUS_TONES[status]}>{BILLING_STATUS_TITLES[status]}</AdminTag>
                    <PhoneLink phone={client.phone} />
                  </div>
                  <p className="mt-1 text-xs text-graphite-600">
                    {[client.city, nicheTitle(client.niche)].filter(Boolean).join(' · ')}
                    {client.publishedAt ? ` · опубликован ${formatDayMsk(client.publishedAt)}` : ''}
                  </p>
                  {client.domain && (
                    <p className="mt-0.5 text-xs text-graphite-600">
                      Свой домен:{' '}
                      <a
                        href={`https://${client.domain}/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-signal-700 hover:underline"
                      >
                        {client.domain}
                      </a>
                    </p>
                  )}
                  <p className="mt-1.5 text-xs text-graphite-700">
                    {pkg.title}: {rub(own.setup)} ₽ разово · {rub(own.monthly)} ₽ в месяц
                    {client.setupPrice === null && client.monthlyPrice === null
                      ? ' (базовые цены)'
                      : ''}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                    {client.setupPaidAt ? (
                      <AdminTag tone="green">
                        Сайт оплачен {formatDayMsk(client.setupPaidAt)}
                      </AdminTag>
                    ) : (
                      <AdminTag tone="quiet">Сайт не оплачен</AdminTag>
                    )}
                    {client.paidUntil ? (
                      <AdminTag tone={STATUS_TONES[status]}>
                        Оплачено до {formatDayMsk(client.paidUntil)}
                      </AdminTag>
                    ) : (
                      <AdminTag tone="quiet">Поддержка не оплачена</AdminTag>
                    )}
                  </p>
                  <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                    <Link
                      href={`/admin/office/${client.id}`}
                      className="font-semibold text-signal-700 hover:underline"
                    >
                      Редактировать
                    </Link>
                    <a
                      href={sitePath}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-graphite-600 hover:underline"
                    >
                      {sitePath}
                    </a>
                  </p>
                </div>
                <div className="lg:w-3/5">
                  <OfficeClientControls
                    id={client.id}
                    name={client.name}
                    setupPrice={client.setupPrice}
                    monthlyPrice={client.monthlyPrice}
                    defaults={{ setup: pkg.setup, monthly: pkg.monthly }}
                    setupPaid={client.setupPaidAt !== null}
                    hasPaidPeriod={client.paidUntil !== null}
                    invoiceUrl={invoiceUrl}
                  />
                </div>
              </Card>
            );
          })
        )}
      </section>

      <Card className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-bold text-graphite-950">Реквизиты для оплаты</h2>
          <p className="mt-1 text-xs text-graphite-600">
            Клиент видит их на странице счёта. Пусто — там написано «Реквизиты пришлём в ответ на
            письмо» и телефон для связи.
          </p>
        </div>
        <OfficePayDetailsForm value={settings.payDetails} max={PAY_DETAILS_MAX} />
      </Card>
    </div>
  );
}
