import { domainToUnicode } from 'node:url';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@specai/database';
import { Card } from '@specai/ui';
import { adminGate } from '@/components/admin/AdminGate';
import { AdminPageHeader, AdminTag, type TagTone } from '@/components/admin/AdminUi';
import { OfficeSiteEditor } from '@/components/admin/OfficeSiteEditor';
import { PhoneLink } from '@/components/admin/PhoneLink';
import { AGENTS } from '@/lib/office/agents';
import { nicheByKey } from '@/lib/office/niches';
import { ANGLE_TITLES } from '@/lib/office/offer';
import { adminOfferView } from '@/lib/office/offerView';
import { buildSitePage } from '@/lib/office/pages';
import type { PageNiche } from '@/lib/office/pageTypes';
import { officePrices } from '@/lib/office/prices';
import { SITE_ACCENTS, SITE_CONTENT_LIMITS, parseSiteContent } from '@/lib/office/siteContent';
import { editorDefaults, editorDraft } from '@/lib/office/siteEditor';
import type { ProspectStatus } from '@/lib/office/types';
import { toPageNiche } from '@/lib/office/visibility';
import { rub, sitePackages } from '@/lib/prices';
import { siteUrl } from '@/lib/siteUrl';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Сайт клиента', robots: { index: false } };

const ID = /^[\w-]{1,64}$/;
const LEADS_SHOWN = 50;

const STATUS_TAGS: Record<ProspectStatus, { title: string; tone: TagTone }> = {
  NEW: { title: 'новый', tone: 'quiet' },
  READY: { title: 'готов к отправке', tone: 'graphite' },
  CONTACTED: { title: 'написали', tone: 'graphite' },
  CALLBACK: { title: 'напомнить', tone: 'warn' },
  AGREED: { title: 'согласился', tone: 'green' },
  PUBLISHED: { title: 'опубликован', tone: 'strong' },
  DECLINED: { title: 'отказ', tone: 'red' },
  REGISTERED: { title: 'зарегистрировался', tone: 'strong' },
};

const when = (date: Date) =>
  date.toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

/** «улыбка.рф» вместо punycode в поле и ссылках для человека. */
function readableDomain(domain: string | null): string {
  if (!domain) return '';
  return domainToUnicode(domain) || domain;
}

/**
 * Сайт одного кандидата агента «Сайты под ключ» (S5, S7): карточка, ссылки на превью и сайт,
 * редактор текстов, фото и цвета, свой домен и последние заявки с сайта; досье фирмы,
 * персональное предложение (как ушло или как будет) и просмотры превью (U3).
 */
export default async function AdminOfficeProspectPage(props: { params: Promise<{ id: string }> }) {
  const gate = await adminGate();
  if (gate) return gate;
  const { id } = await props.params;
  if (!ID.test(id)) notFound();

  const prospect = await prisma.prospect.findUnique({
    where: { id },
    select: {
      id: true,
      kind: true,
      status: true,
      slug: true,
      token: true,
      name: true,
      phone: true,
      email: true,
      whatsapp: true,
      source: true,
      address: true,
      city: true,
      lat: true,
      lon: true,
      niche: true,
      tags: true,
      hours: true,
      siteJson: true,
      domain: true,
      publishedAt: true,
      dossierJson: true,
      offerJson: true,
      previewViews: true,
      previewViewedAt: true,
    },
  });
  if (!prospect) notFound();

  const isSite = prospect.kind === 'site';
  const [leads, prices] = await Promise.all([
    isSite
      ? prisma.siteLead.findMany({
          where: { prospectId: prospect.id },
          orderBy: { createdAt: 'desc' },
          take: LEADS_SHOWN,
          select: {
            id: true,
            name: true,
            phone: true,
            message: true,
            forwardedAt: true,
            forwardError: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]),
    officePrices(),
  ]);
  const { dossier, offer, sent, ai } = adminOfferView(prospect);
  const pack = sitePackages(prices).find((p) => p.key === offer.packageKey);

  const base = siteUrl();
  const niche = nicheByKey(prospect.niche);
  const pageNiche: PageNiche = niche
    ? toPageNiche(niche)
    : { key: prospect.niche, title: prospect.niche, services: [], heroLine: '', accent: 'teal' };
  const cardPage = buildSitePage(
    {
      kind: 'site',
      status: prospect.status,
      slug: prospect.slug,
      name: prospect.name,
      phone: prospect.phone,
      address: prospect.address,
      city: prospect.city,
      lat: prospect.lat,
      lon: prospect.lon,
      tags: prospect.tags,
      hours: prospect.hours,
      whatsapp: prospect.whatsapp,
      source: prospect.source,
    },
    pageNiche,
  );
  const status = STATUS_TAGS[prospect.status as ProspectStatus] ?? {
    title: prospect.status,
    tone: 'quiet' as const,
  };
  const published = prospect.status === 'PUBLISHED';
  const previewHref = `${base}/preview/${prospect.token}`;
  const sitePath = `/${isSite ? 's' : 'p'}/${prospect.slug}`;
  const domain = readableDomain(prospect.domain);

  return (
    <div className="flex flex-col gap-5">
      <AdminPageHeader title={prospect.name} text={AGENTS[isSite ? 'sites' : 'providers'].name}>
        <Link
          href="/admin/office"
          className="text-sm font-semibold text-signal-700 hover:underline"
        >
          ← Назад в офис
        </Link>
      </AdminPageHeader>

      <Card className="flex flex-col gap-3">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-graphite-500">Ниша</dt>
          <dd>
            {pageNiche.title}
            {!niche && (
              <span className="text-red-700">
                {' '}
                · такой ниши нет в справочнике — сайт и превью не откроются
              </span>
            )}
          </dd>
          <dt className="text-graphite-500">Город</dt>
          <dd>{prospect.city ?? 'не указан'}</dd>
          <dt className="text-graphite-500">Телефон</dt>
          <dd>
            <PhoneLink phone={prospect.phone} />
          </dd>
          <dt className="text-graphite-500">Почта</dt>
          <dd>
            {prospect.email ?? (
              <span className="text-graphite-600">
                нет — заявки с сайта компании не пересылаются: они приходят вам в Telegram и видны
                ниже
              </span>
            )}
          </dd>
          <dt className="text-graphite-500">Статус</dt>
          <dd>
            <AdminTag tone={status.tone}>{status.title}</AdminTag>
          </dd>
        </dl>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {prospect.status === 'DECLINED' ? (
            <span className="text-graphite-500">Превью закрыто: компания отказалась</span>
          ) : (
            <a
              href={previewHref}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-signal-700 hover:underline"
            >
              Превью
            </a>
          )}
          {published || (!isSite && prospect.status === 'REGISTERED') ? (
            <a
              href={sitePath}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-signal-700 hover:underline"
            >
              Сайт {sitePath}
            </a>
          ) : (
            <span className="text-graphite-500">Сайт {sitePath} откроется после публикации</span>
          )}
          {isSite && prospect.domain && (
            <a
              href={`https://${prospect.domain}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-signal-700 hover:underline"
            >
              {domain}
            </a>
          )}
        </p>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-graphite-950">Досье</h2>
        {dossier ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-graphite-500">Факты</dt>
            <dd>
              {dossier.facts.length ? (
                <ul className="list-disc pl-4">
                  {dossier.facts.map((fact) => (
                    <li key={fact}>{fact}</li>
                  ))}
                </ul>
              ) : (
                <span className="text-graphite-600">в карточке, кроме телефона, ничего нет</span>
              )}
            </dd>
            <dt className="text-graphite-500">Пробелы</dt>
            <dd>{dossier.gaps.join('; ')}</dd>
            <dt className="text-graphite-500">Конкуренты рядом</dt>
            <dd>
              {dossier.competitors
                ? `в ${dossier.competitors.radiusKm} км той же сферы — ${dossier.competitors.sameNiche}, с сайтом — ${dossier.competitors.withSite}`
                : 'нет координат — сравнить не с чем'}
            </dd>
          </dl>
        ) : (
          <p className="text-sm text-graphite-600">
            Досье нет: компания найдена до того, как офис начал его собирать, или карточка
            повреждена. Письмо уйдёт с общим заходом.
          </p>
        )}
        <p className="text-sm">
          <span className="text-graphite-500">Просмотры превью: </span>
          {prospect.previewViews > 0 ? (
            <>
              <AdminTag tone="accent">×{prospect.previewViews}</AdminTag>
              {prospect.previewViewedAt && (
                <span className="text-graphite-600"> впервые {when(prospect.previewViewedAt)}</span>
              )}
            </>
          ) : (
            <span className="text-graphite-600">ещё не открывали</span>
          )}
        </p>
      </Card>

      {isSite && (
        <Card className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-graphite-950">Предложение</h2>
            <AdminTag tone={sent ? 'green' : 'quiet'}>{sent ? 'так ушло' : 'так будет'}</AdminTag>
            {ai && <AdminTag tone="accent">переписал ИИ-аналитик</AdminTag>}
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-graphite-500">Заход</dt>
            <dd>{ANGLE_TITLES[offer.angle]}</dd>
            <dt className="text-graphite-500">Тема</dt>
            <dd className="font-semibold">{offer.subject}</dd>
            <dt className="text-graphite-500">Вступление</dt>
            <dd>{offer.opener}</dd>
            <dt className="text-graphite-500">Пункты</dt>
            <dd>
              <ul className="list-disc pl-4">
                {offer.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </dd>
            <dt className="text-graphite-500">Пакет</dt>
            <dd>
              {pack
                ? `${pack.title}: ${rub(pack.setup)} ₽ разово + ${rub(pack.monthly)} ₽ в месяц — `
                : ''}
              {offer.packageReason}
            </dd>
          </dl>
          {!sent && (
            <p className="text-xs text-graphite-600">
              При отправке офис сам выберет заход по статистике ответов — этот показан как пример.
            </p>
          )}
        </Card>
      )}

      {isSite ? (
        <Card className="flex flex-col gap-3">
          <div>
            <h2 className="text-lg font-bold text-graphite-950">Редактор сайта</h2>
            <p className="mt-1 text-xs text-graphite-600">
              Пустое поле — как в карточке компании. Правки сразу видны на сайте и в превью.
            </p>
          </div>
          <OfficeSiteEditor
            id={prospect.id}
            slug={prospect.slug}
            initial={editorDraft(parseSiteContent(prospect.siteJson))}
            domain={domain}
            defaults={editorDefaults(cardPage)}
            nicheTitle={pageNiche.title}
            accents={SITE_ACCENTS}
            limits={SITE_CONTENT_LIMITS}
          />
        </Card>
      ) : (
        <Card className="text-sm text-graphite-700">
          Редактор и свой домен — только для сайтов агента «{AGENTS.sites.name}». Страница
          подрядчика собирается из карточки и каталога площадки.
        </Card>
      )}

      {isSite && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-bold text-graphite-950">
            Заявки с сайта{' '}
            <span className="font-mono text-base text-graphite-500">
              {leads.length === LEADS_SHOWN ? `последние ${LEADS_SHOWN}` : leads.length}
            </span>
          </h2>
          {leads.length === 0 ? (
            <Card className="text-sm text-graphite-600">
              Заявок пока нет. Они появятся, когда сайт опубликован и форма заявки включена.
            </Card>
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-left text-xs">
                <thead className="bg-graphite-50 text-graphite-500">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Когда</th>
                    <th className="px-3 py-2 font-semibold">Имя</th>
                    <th className="px-3 py-2 font-semibold">Телефон</th>
                    <th className="px-3 py-2 font-semibold">Комментарий</th>
                    <th className="px-3 py-2 font-semibold">Компании</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-graphite-100">
                  {leads.map((lead) => (
                    <tr key={lead.id} className="align-top">
                      <td className="whitespace-nowrap px-3 py-2">{when(lead.createdAt)}</td>
                      <td className="px-3 py-2">{lead.name}</td>
                      <td className="px-3 py-2">
                        <PhoneLink phone={lead.phone} />
                      </td>
                      <td className="max-w-md whitespace-pre-line break-words px-3 py-2">
                        {lead.message ?? '—'}
                      </td>
                      <td className="px-3 py-2">
                        {lead.forwardedAt ? (
                          <AdminTag tone="green">доставлено</AdminTag>
                        ) : lead.forwardError ? (
                          <>
                            <AdminTag tone="red">не доставлено</AdminTag>
                            <p className="mt-1 max-w-xs text-graphite-600">{lead.forwardError}</p>
                          </>
                        ) : (
                          <AdminTag tone="quiet">не отправлено</AdminTag>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </section>
      )}
    </div>
  );
}
