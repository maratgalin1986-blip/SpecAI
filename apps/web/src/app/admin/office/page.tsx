import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@specai/database';
import { Card } from '@specai/ui';
import { adminGate } from '@/components/admin/AdminGate';
import { AdminPageHeader, AdminTag, StatTile } from '@/components/admin/AdminUi';
import { OfficeAiForm } from '@/components/admin/OfficeAiForm';
import { OfficeFunnel } from '@/components/admin/OfficeFunnel';
import { OfficeLearning } from '@/components/admin/OfficeLearning';
import { OfficeManualForm } from '@/components/admin/OfficeManualForm';
import { OfficeOutreachCard } from '@/components/admin/OfficeOutreachCard';
import { OfficePlanForm } from '@/components/admin/OfficePlanForm';
import { OfficePricesForm } from '@/components/admin/OfficePricesForm';
import { OfficeProspectControls } from '@/components/admin/OfficeProspectControls';
import { OfficeRunForm } from '@/components/admin/OfficeRunForm';
import { PhoneLink } from '@/components/admin/PhoneLink';
import { mskDayBounds } from '@/lib/adminCrm';
import { integrationFlags } from '@/lib/integrationFlags';
import { serverChannels } from '@/lib/notifications/adapters';
import { searchAlertText, searchHealth } from '@/lib/office/searchHealth';
import { officeMailConfigured } from '@/lib/office/smtp';
import { unsubscribeConfigured } from '@/lib/office/unsubscribe';
import { AGENTS, AGENT_IDS } from '@/lib/office/agents';
import { HOT_DAYS, HOT_STATUSES } from '@/lib/office/digest';
import { collectFunnel } from '@/lib/office/funnel';
import { collectAngleStats, learningTable } from '@/lib/office/learning';
import { nicheTitle, nichesOf } from '@/lib/office/niches';
import type { PageProspect } from '@/lib/office/pageTypes';
import { nextStep, parsePlan } from '@/lib/office/plan';
import { isDuplicateMark } from '@/lib/office/contacted';
import { previewViewsLabel } from '@/lib/office/previewViews';
import { officePrices } from '@/lib/office/prices';
import { buildCallScript } from '@/lib/office/scripts';
import { AI_DAILY_CAP_MAX, readOfficeSettings } from '@/lib/office/settings';
import { SITE } from '@/lib/site';
import { siteUrl } from '@/lib/siteUrl';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Офис агентов', robots: { index: false } };

const CANDIDATES_SHOWN = 200;
const PUBLISHED_SHOWN = 100;
const DECLINED_SHOWN = 50;
const RUNS_SHOWN = 20;
const HOT_SHOWN = 20;

const when = (date: Date) =>
  date.toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

const dayMonth = (date: Date) =>
  date.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit' });

/** Only the fields a page or a call script needs — never the token or the note (R19). */
function toPageProspect(p: {
  kind: string;
  status: string;
  slug: string;
  name: string;
  phone: string;
  address: string | null;
  city: string | null;
  lat: number | null;
  lon: number | null;
  tags: string | null;
  hours: string | null;
}): PageProspect {
  return {
    kind: p.kind === 'provider' ? 'provider' : 'site',
    status: p.status,
    slug: p.slug,
    name: p.name,
    phone: p.phone,
    address: p.address,
    city: p.city,
    lat: p.lat,
    lon: p.lon,
    tags: p.tags,
    hours: p.hours,
  };
}

/**
 * The owner's office of two agents (tasks/autopilot/2026-11-09-office-agents): who was found,
 * who was written to, who answered, what is published; the plan, the prices, the log of runs.
 */
export default async function AdminOfficePage() {
  const gate = await adminGate();
  if (gate) return gate;
  const now = new Date();
  const { start: todayStart, end: todayEnd } = mskDayBounds(now);
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const hotSince = new Date(now.getTime() - HOT_DAYS * 86_400_000);
  const base = siteUrl();

  const [
    settings,
    prices,
    readyCount,
    contactedCount,
    repliedCount,
    publishedCount,
    remindCount,
    declinedCount,
    candidatesRaw,
    published,
    declined,
    runs,
    emailToday,
    whatsappToday,
    funnel,
    angleStats,
    hot,
  ] = await Promise.all([
    readOfficeSettings(),
    officePrices(),
    prisma.prospect.count({ where: { status: 'READY' } }),
    prisma.prospect.count({ where: { status: 'CONTACTED' } }),
    prisma.prospect.count({ where: { repliedAt: { gte: weekAgo } } }),
    prisma.prospect.count({ where: { status: { in: ['PUBLISHED', 'REGISTERED'] } } }),
    prisma.prospect.count({ where: { status: 'CALLBACK', callAt: { lt: todayEnd } } }),
    prisma.prospect.count({ where: { status: 'DECLINED' } }),
    prisma.prospect.findMany({
      where: { status: { in: ['READY', 'CONTACTED', 'CALLBACK', 'AGREED'] } },
      orderBy: { createdAt: 'desc' },
      take: CANDIDATES_SHOWN,
    }),
    prisma.prospect.findMany({
      where: { status: { in: ['PUBLISHED', 'REGISTERED'] } },
      orderBy: { publishedAt: 'desc' },
      take: PUBLISHED_SHOWN,
      select: {
        id: true,
        kind: true,
        status: true,
        slug: true,
        name: true,
        city: true,
        niche: true,
        publishedAt: true,
        registeredAt: true,
        note: true,
      },
    }),
    prisma.prospect.findMany({
      where: { status: 'DECLINED' },
      orderBy: { declinedAt: 'desc' },
      take: DECLINED_SHOWN,
      select: {
        id: true,
        name: true,
        city: true,
        niche: true,
        phone: true,
        declinedAt: true,
        note: true,
      },
    }),
    prisma.officeRun.findMany({ orderBy: { startedAt: 'desc' }, take: RUNS_SHOWN }),
    prisma.prospect.count({ where: { emailSentAt: { gte: todayStart, lt: todayEnd } } }),
    prisma.prospect.count({ where: { whatsappSentAt: { gte: todayStart, lt: todayEnd } } }),
    collectFunnel(prisma, now),
    collectAngleStats(prisma),
    // «Горячие»: открыли превью за HOT_DAYS дней и не ответили — им пора позвонить.
    prisma.prospect.findMany({
      where: {
        status: { in: [...HOT_STATUSES] },
        repliedAt: null,
        previewViewedAt: { gte: hotSince },
      },
      orderBy: { previewViewedAt: 'desc' },
      take: HOT_SHOWN,
      select: {
        id: true,
        name: true,
        phone: true,
        city: true,
        niche: true,
        previewViews: true,
        previewViewedAt: true,
      },
    }),
  ]);

  // Overdue reminders first (the oldest first), then the newest candidates.
  const candidates = [...candidatesRaw].sort((a, b) => {
    const dueA = a.status === 'CALLBACK' && a.callAt && a.callAt < todayEnd ? 1 : 0;
    const dueB = b.status === 'CALLBACK' && b.callAt && b.callAt < todayEnd ? 1 : 0;
    if (dueA !== dueB) return dueB - dueA;
    if (dueA && a.callAt && b.callAt) return a.callAt.getTime() - b.callAt.getTime();
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  const plan = parsePlan(settings.plan);
  const next = nextStep(plan.steps, settings.cursor);
  const lastRuns = Object.fromEntries(
    AGENT_IDS.map((id) => [id, runs.find((run) => run.agent === id) ?? null]),
  );

  // Поиск упал, крутится вхолостую или давно не запускался — владелец видит это сразу, а не в
  // журнале внизу.
  const failedRun = runs.find((r) => r.finishedAt !== null && r.error);
  const searchAlert = searchAlertText(
    searchHealth(runs, new Date()),
    failedRun?.error ?? null,
    settings.paused,
  );

  return (
    <div className="flex flex-col gap-5">
      <AdminPageHeader
        title="Офис агентов"
        text="Два агента ищут компании без сайта на картах, готовят страницы и пишут им. Здесь — кандидаты, ответы, публикации и план обхода."
      >
        {settings.paused && <AdminTag tone="warn">Поиск на паузе</AdminTag>}
        {settings.outreachPaused && <AdminTag tone="warn">Рассылка на паузе</AdminTag>}
        <Link
          href="/admin/office/whatsapp"
          className="text-sm font-semibold text-signal-700 hover:underline"
        >
          WhatsApp вручную
        </Link>
        <Link
          href="/admin/office/pisma"
          className="text-sm font-semibold text-signal-700 hover:underline"
        >
          Письма дня
        </Link>
        <Link
          href="/admin/office/clients"
          className="text-sm font-semibold text-signal-700 hover:underline"
        >
          Клиенты
        </Link>
        <Link
          href="/sajt-pod-klyuch"
          target="_blank"
          className="text-sm font-semibold text-signal-700 hover:underline"
        >
          Страница услуги
        </Link>
      </AdminPageHeader>

      {searchAlert && (
        <Card className="border-red-300 text-sm text-red-800" role="alert">
          {searchAlert} Подробности — в «Журнале прогонов» внизу страницы.
        </Card>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <StatTile label="Готово к отправке" value={readyCount} />
        <StatTile label="Написали" value={contactedCount} />
        <StatTile label="Ответили" value={repliedCount} hint="за 7 дней" />
        <StatTile label="Опубликовано" value={publishedCount} />
        <StatTile
          label="Напомнить сегодня"
          value={remindCount}
          tone={remindCount ? 'dark' : 'default'}
        />
      </div>

      <OfficeFunnel data={funnel} />

      {hot.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-bold text-graphite-950">
            Горячие <span className="font-mono text-base text-graphite-500">{hot.length}</span>
          </h2>
          <p className="-mt-2 text-xs text-graphite-600">
            Открыли превью за {HOT_DAYS} дней и ещё не ответили — самое время позвонить.
          </p>
          <Card className="flex flex-col divide-y divide-graphite-100 p-0">
            {hot.map((p) => (
              <div
                key={p.id}
                className="flex flex-col gap-1 px-4 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <Link
                    href={`/admin/office/${p.id}`}
                    className="font-semibold text-signal-700 hover:underline"
                  >
                    {p.name}
                  </Link>{' '}
                  <PhoneLink phone={p.phone} />
                  <span className="text-xs text-graphite-600">
                    {' '}
                    · {[p.city, nicheTitle(p.niche)].filter(Boolean).join(' · ')}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  {previewViewsLabel(p.previewViews) && (
                    <AdminTag tone="accent">{previewViewsLabel(p.previewViews)}</AdminTag>
                  )}
                  {p.previewViewedAt && (
                    <span className="text-graphite-500">впервые {when(p.previewViewedAt)}</span>
                  )}
                </div>
              </div>
            ))}
          </Card>
        </section>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {AGENT_IDS.map((id) => {
          const agent = AGENTS[id];
          const last = lastRuns[id];
          const nextForAgent = next.step?.agent === id ? next.step : null;
          const defaultCity = nextForAgent?.city ?? SITE.city;
          return (
            <Card key={id} className="flex flex-col gap-3">
              <div>
                <h2 className="text-lg font-bold text-graphite-950">{agent.name}</h2>
                <p className="mt-1 text-sm text-graphite-600">{agent.description}</p>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-graphite-700">
                <dt className="text-graphite-500">Последний прогон</dt>
                <dd>
                  {last ? (
                    <>
                      {when(last.startedAt)} · {last.city} · {nicheTitle(last.niche)} · найдено{' '}
                      {last.found}, создано {last.created}
                      {last.error ? (
                        <span className="text-red-700"> · ошибка: {last.error}</span>
                      ) : null}
                    </>
                  ) : (
                    'ещё не было'
                  )}
                </dd>
                <dt className="text-graphite-500">Следующий шаг плана</dt>
                <dd>
                  {next.step
                    ? `${AGENTS[next.step.agent].name} · ${nicheTitle(next.step.niche)} · ${next.step.city}`
                    : 'план пустой'}
                </dd>
              </dl>
              <OfficeRunForm
                agent={id}
                niches={nichesOf(id).map((n) => ({ key: n.key, title: n.title }))}
                defaultCity={defaultCity}
              />
            </Card>
          );
        })}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-graphite-950">
          Кандидаты{' '}
          <span className="font-mono text-base text-graphite-500">{candidates.length}</span>
        </h2>
        {candidates.length === 0 ? (
          <Card>Кандидатов пока нет: запустите шаг у агента или добавьте компанию вручную.</Card>
        ) : (
          candidates.map((p) => {
            const due = p.status === 'CALLBACK' && p.callAt && p.callAt < todayEnd;
            const title = nicheTitle(p.niche);
            const previewUrl = `${base}/preview/${p.token}`;
            const script = buildCallScript(toPageProspect(p), {
              previewUrl,
              prices: { setup: prices.setup, monthly: prices.monthly },
              nicheTitle: title,
            });
            return (
              <Card
                key={p.id}
                className={`flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between ${
                  due ? 'border-amber-300' : ''
                }`}
              >
                <div className="min-w-0 lg:w-2/5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-semibold">{p.name}</span>
                    <PhoneLink phone={p.phone} />
                    <AdminTag tone={p.kind === 'provider' ? 'accent' : 'graphite'}>
                      {AGENTS[p.kind === 'provider' ? 'providers' : 'sites'].name}
                    </AdminTag>
                  </div>
                  <p className="mt-1 text-xs text-graphite-600">
                    {[p.city, title].filter(Boolean).join(' · ')}
                    {p.address && p.address !== p.city ? ` · ${p.address}` : ''}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                    {p.emailSentAt && (
                      <AdminTag tone="quiet">
                        ✉{' '}
                        {isDuplicateMark(p.emailSentAt)
                          ? 'адресу уже писали'
                          : dayMonth(p.emailSentAt)}
                      </AdminTag>
                    )}
                    {p.whatsappSentAt && (
                      <AdminTag tone="quiet">
                        WA{' '}
                        {isDuplicateMark(p.whatsappSentAt)
                          ? 'на номер уже писали'
                          : dayMonth(p.whatsappSentAt)}
                      </AdminTag>
                    )}
                    {p.repliedAt && (
                      <AdminTag tone="green">ответил {dayMonth(p.repliedAt)}</AdminTag>
                    )}
                    {p.status === 'CALLBACK' && p.callAt && (
                      <AdminTag tone={due ? 'warn' : 'graphite'}>
                        напомнить {dayMonth(p.callAt)}
                      </AdminTag>
                    )}
                    {previewViewsLabel(p.previewViews) && (
                      <AdminTag tone="accent">{previewViewsLabel(p.previewViews)}</AdminTag>
                    )}
                    {p.outreachError && (
                      <AdminTag tone="red" title={p.outreachError}>
                        ошибка отправки
                      </AdminTag>
                    )}
                  </div>
                  <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                    <a
                      href={previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-signal-700 hover:underline"
                    >
                      Превью
                    </a>
                    <Link
                      href={`/admin/office/${p.id}`}
                      className="font-semibold text-signal-700 hover:underline"
                    >
                      Досье и сайт
                    </Link>
                    {p.telegram && (
                      <a
                        href={`https://t.me/${p.telegram}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-signal-700 hover:underline"
                      >
                        Написать в Telegram
                      </a>
                    )}
                    {p.email && <span className="text-graphite-600">{p.email}</span>}
                    <span className="text-graphite-500">{when(p.createdAt)}</span>
                  </p>
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer font-semibold text-graphite-700">
                      Текст звонка
                    </summary>
                    <div className="mt-2 flex flex-col gap-2 rounded-md bg-graphite-50 p-3 text-graphite-800">
                      <p className="font-semibold">{script.title}</p>
                      {script.steps.map((step) => (
                        <p key={step.heading}>
                          <span className="font-semibold">{step.heading}.</span> {step.text}
                        </p>
                      ))}
                    </div>
                  </details>
                </div>
                <div className="lg:w-3/5">
                  <OfficeProspectControls
                    id={p.id}
                    variant={p.status === 'AGREED' ? 'agreed' : 'open'}
                    note={p.note}
                    kind={p.kind === 'site' ? 'site' : 'provider'}
                    paid={p.setupPaidAt !== null}
                  />
                </div>
              </Card>
            );
          })
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-graphite-950">
          Опубликовано{' '}
          <span className="font-mono text-base text-graphite-500">{publishedCount}</span>
        </h2>
        {published.length === 0 ? (
          <Card>Опубликованных страниц пока нет.</Card>
        ) : (
          <Card className="flex flex-col divide-y divide-graphite-100 p-0">
            {published.map((p) => {
              const href = `/${p.kind === 'provider' ? 'p' : 's'}/${p.slug}`;
              return (
                <div
                  key={p.id}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 text-sm">
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-signal-700 hover:underline"
                    >
                      {p.name}
                    </a>
                    <span className="text-graphite-500"> · {href}</span>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-graphite-600">
                      {[p.city, nicheTitle(p.niche)].filter(Boolean).join(' · ')}
                      {p.publishedAt ? ` · ${dayMonth(p.publishedAt)}` : ''}
                      {p.status === 'REGISTERED' && (
                        <AdminTag tone="strong">
                          зарегистрировался{p.registeredAt ? ` ${dayMonth(p.registeredAt)}` : ''}
                        </AdminTag>
                      )}
                    </p>
                  </div>
                  <OfficeProspectControls id={p.id} variant="published" note={p.note} />
                </div>
              );
            })}
          </Card>
        )}
      </section>

      <details className="rounded-xl border border-graphite-100 bg-white">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-graphite-800">
          Отказы <span className="font-mono text-graphite-500">{declinedCount}</span>
        </summary>
        {declined.length === 0 ? (
          <p className="px-4 pb-3 text-sm text-graphite-600">Отказов нет.</p>
        ) : (
          <div className="divide-y divide-graphite-100 border-t border-graphite-100">
            {declined.map((p) => (
              <div
                key={p.id}
                className="flex flex-col gap-2 px-4 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <span className="font-semibold">{p.name}</span> <PhoneLink phone={p.phone} />
                  <span className="text-xs text-graphite-600">
                    {' '}
                    · {[p.city, nicheTitle(p.niche)].filter(Boolean).join(' · ')}
                    {p.declinedAt ? ` · ${dayMonth(p.declinedAt)}` : ''}
                  </span>
                  {p.note && <p className="text-xs text-graphite-600">{p.note}</p>}
                </div>
                <OfficeProspectControls id={p.id} variant="declined" note={p.note} />
              </div>
            ))}
          </div>
        )}
      </details>

      <div className="grid gap-3 md:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-bold text-graphite-950">Добавить вручную</h2>
          <OfficeManualForm agents={AGENT_IDS.map((id) => ({ id, name: AGENTS[id].name }))} />
        </Card>
        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-bold text-graphite-950">Цены сайта под ключ</h2>
          <p className="text-xs text-graphite-600">
            Подставляются в текст звонка и письма агента «Сайты под ключ».
          </p>
          <OfficePricesForm setup={prices.setup} monthly={prices.monthly} yearly={prices.yearly} />
        </Card>
        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-bold text-graphite-950">План обхода</h2>
          <p className="text-xs text-graphite-600">
            Шагов: {plan.steps.length}, следующий — № {next.step ? settings.cursor + 1 : '—'}.
          </p>
          <OfficePlanForm plan={settings.plan} paused={settings.paused} />
        </Card>
        <OfficeOutreachCard
          settings={settings}
          today={{ email: emailToday, whatsapp: whatsappToday }}
          channels={{
            email: officeMailConfigured() && unsubscribeConfigured(),
            whatsapp: serverChannels().whatsapp,
          }}
          mode={settings.outreachMode}
        />
        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-bold text-graphite-950">ИИ-аналитик</h2>
          <p className="text-xs text-graphite-600">
            Переписывает вступление и три пункта персонального предложения живым языком — только по
            фактам из карточки компании. Сбой или лимит — письмо уходит без ИИ.
          </p>
          <OfficeAiForm
            enabled={settings.aiOffers}
            dailyCap={settings.aiDailyCap}
            maxCap={AI_DAILY_CAP_MAX}
            keyConfigured={integrationFlags().ai}
          />
        </Card>
      </div>

      <OfficeLearning rows={learningTable(angleStats)} />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-graphite-950">Журнал прогонов</h2>
        {runs.length === 0 ? (
          <Card>Прогонов ещё не было.</Card>
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-left text-xs">
              <thead className="bg-graphite-50 text-graphite-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">Когда</th>
                  <th className="px-3 py-2 font-semibold">Агент</th>
                  <th className="px-3 py-2 font-semibold">Ниша</th>
                  <th className="px-3 py-2 font-semibold">Город</th>
                  <th className="px-3 py-2 font-semibold">Запуск</th>
                  <th className="px-3 py-2 text-right font-semibold">Найдено</th>
                  <th className="px-3 py-2 text-right font-semibold">Создано</th>
                  <th className="px-3 py-2 text-right font-semibold">Пропущено</th>
                  <th className="px-3 py-2 font-semibold">Ошибка</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-graphite-100">
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td className="whitespace-nowrap px-3 py-2">{when(run.startedAt)}</td>
                    <td className="px-3 py-2">
                      {run.agent === 'sites' || run.agent === 'providers'
                        ? AGENTS[run.agent].name
                        : run.agent}
                    </td>
                    <td className="px-3 py-2">{nicheTitle(run.niche)}</td>
                    <td className="px-3 py-2">{run.city}</td>
                    <td className="px-3 py-2">
                      {run.trigger === 'admin'
                        ? 'вручную'
                        : run.trigger === 'telegram'
                          ? 'Telegram'
                          : 'по плану'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{run.found}</td>
                    <td className="px-3 py-2 text-right font-mono">{run.created}</td>
                    <td className="px-3 py-2 text-right font-mono">{run.skipped}</td>
                    <td className="px-3 py-2 text-red-700">
                      {run.error ?? (run.finishedAt ? '' : 'идёт')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>
    </div>
  );
}
