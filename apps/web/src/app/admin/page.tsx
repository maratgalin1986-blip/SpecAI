import type { Metadata } from 'next';
import { SignupCounters } from '@/components/admin/SignupCounters';
import { loadAdminStats } from '@/lib/adminStats';
import { HOUSE_COMPANY_ID, prisma } from '@specai/database';
import { Card } from '@specai/ui';
import { AdminLogin } from '@/components/AdminLogin';
import { LeadOutcome } from '@/components/LeadOutcome';
import { LeadStatusSelect } from '@/components/LeadStatusSelect';
import { LinkOwnerForm } from '@/components/LinkOwnerForm';
import { SupportSettingsForm } from '@/components/admin/SupportSettingsForm';
import { CommentModerationButtons } from '@/components/Comments';
import { EraseOrderButton } from '@/components/ChatOrderContact';
import { ModerationButtons, CopyField, TelegramSetupButton } from '@/components/AdminIntegrations';
import { headers } from 'next/headers';
import { inboundApiToken, telegramWebhookSecret, whatsappWebhookToken } from '@/lib/integrations';
import { isAdminConfigured, isAdminRequest } from '@/lib/admin';
import { SITE } from '@/lib/site';
import { formLabel, splitSource } from '@/lib/marketing';
import { AdminVerifyToggle } from '@/components/AdminVerifyToggle';
import { providerPath } from '@/lib/providerSeo';
import { chipClass } from '@/components/admin/AdminUi';
import { PhoneLink } from '@/components/admin/PhoneLink';
import {
  LEAD_FILTERS,
  filterLeads,
  leadFilterCounts,
  leadSourceLabel,
  parseLeadFilter,
  sortLeads,
} from '@/lib/adminLeads';
import { capList, parseShowAll, showAllHref } from '@/lib/adminList';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Заявки на звонок', robots: { index: false } };

const SOURCE_LABELS: Record<string, string> = {
  SITE: 'Сайт',
  TELEGRAM: 'Telegram',
  WHATSAPP: 'WhatsApp',
  OTHER: 'Другое',
};

/** Callbacks loaded for the list and the 30-day marketing table. */
const LEADS_LOADED = 200;

function siteOrigin() {
  const h = headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

type Query = Record<string, string | string[] | undefined>;

export default async function AdminPage({ searchParams = {} }: { searchParams?: Query }) {
  if (!isAdminConfigured()) {
    return (
      <Card className="mx-auto max-w-lg">
        <h1 className="text-xl font-bold">Админка отключена</h1>
        <p className="mt-2 text-sm text-slate-600">
          Чтобы видеть заявки на звонок, задайте переменную окружения{' '}
          <code className="rounded bg-slate-100 px-1">ADMIN_PASSWORD</code> в настройках Vercel и
          сделайте Redeploy.
        </p>
      </Card>
    );
  }

  if (!isAdminRequest()) {
    return (
      <Card className="mx-auto max-w-sm">
        <h1 className="mb-4 text-xl font-bold">Вход для администратора</h1>
        <AdminLogin />
      </Card>
    );
  }

  // Bot drafts without a phone are not leads yet (lib/botDrafts.ts).
  const leadsWhere = { NOT: { phone: '' } };
  const [stats, leads, leadsTotal] = await Promise.all([
    loadAdminStats(),
    prisma.lead.findMany({
      where: leadsWhere,
      orderBy: { createdAt: 'desc' },
      take: LEADS_LOADED,
    }),
    prisma.lead.count({ where: leadsWhere }),
  ]);
  const [pendingOrders, importedStats] = await Promise.all([
    prisma.order.findMany({
      where: { status: 'PENDING_REVIEW' },
      include: { category: true, location: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.order.groupBy({
      by: ['source'],
      where: { source: { not: 'SITE' }, createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } },
      _count: true,
    }),
  ]);
  const pendingComments = await prisma.comment.findMany({
    where: { status: 'PENDING' },
    include: {
      author: { select: { name: true, email: true } },
      targetCompany: { select: { name: true } },
      targetUser: { select: { name: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: 100,
  });
  const pendingReviews = await prisma.review.findMany({
    where: { textStatus: 'PENDING' },
    include: {
      author: { select: { name: true, email: true } },
      company: { select: { name: true } },
      equipment: { select: { name: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: 100,
  });
  // «Исполнители»: provider companies with the «Проверен» switch, unchecked first.
  const providers = await prisma.company.findMany({
    where: { isProvider: true },
    select: {
      id: true,
      name: true,
      taxId: true,
      phone: true,
      verified: true,
      baseAddress: true,
      createdAt: true,
      _count: { select: { equipment: { where: { status: { not: 'RETIRED' } } } } },
    },
    orderBy: [{ verified: 'asc' }, { createdAt: 'desc' }],
    take: 200,
  });
  const houseManagers = await prisma.user.findMany({
    where: { companyId: HOUSE_COMPANY_ID, role: 'PROVIDER_ADMIN' },
    select: { name: true, email: true },
    take: 20,
  });
  const origin = siteOrigin();
  const tgSecretReady = Boolean(telegramWebhookSecret());
  const whatsappToken = whatsappWebhookToken();
  const inboundToken = inboundApiToken();
  const newCount = leads.filter((lead) => lead.status === 'NEW').length;
  const moderationCount = pendingOrders.length;
  const commentsCount = pendingComments.length + pendingReviews.length;
  // Callbacks: new ones on top, a status filter, the first 30 and «Показать ещё».
  const leadFilter = parseLeadFilter(searchParams.leads);
  const showAll = parseShowAll(searchParams.all);
  const leadCounts = leadFilterCounts(leads);
  const leadList = capList(filterLeads(sortLeads(leads), leadFilter), showAll);
  const leadsHref = (filter: string) =>
    filter === 'all' ? '/admin#leads' : `/admin?leads=${filter}#leads`;
  // Marketing: which channels and which forms brought requests in 30 days.
  const monthAgo = Date.now() - 30 * 86_400_000;
  const recentLeads = leads.filter((lead) => lead.createdAt.getTime() >= monthAgo);
  type Row = [name: string, count: number, deals: number, dealSum: number];
  const tally = (key: 'channel' | 'form'): Row[] =>
    Object.values(
      recentLeads.reduce<Record<string, Row>>((acc, lead) => {
        const parts = splitSource(lead.source);
        const name = key === 'form' ? formLabel(parts.form) : parts.channel;
        const row = (acc[name] ??= [name, 0, 0, 0]);
        row[1] += 1;
        if (lead.outcome === 'deal') {
          row[2] += 1;
          row[3] += lead.amount ?? 0;
        }
        return acc;
      }, {}),
    ).sort((a, b) => b[1] - a[1]);
  const reports: [string, Row[]][] = [
    ['Каналы', tally('channel')],
    ['Формы на сайте', tally('form')],
  ];
  const metrikaReady = /^\d+$/.test(SITE.metrikaId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Панель управления</h1>
          <p className="text-slate-600">
            Заявок на звонок — новых:{' '}
            <span className="font-semibold text-amber-700">{newCount}</span> · всего {leadsTotal}
          </p>
        </div>
        {/* The day's work with its counters first, then the other sections. */}
        <nav aria-label="Разделы CRM" className="flex flex-wrap gap-1.5 text-xs">
          <a href="#leads" className={chipClass(false)}>
            Звонки{newCount > 0 ? ` · ${newCount}` : ''}
          </a>
          <a
            href="#moderation"
            className={`${chipClass(false)} ${moderationCount > 0 ? 'border-amber-400' : ''}`}
          >
            Модерация{moderationCount > 0 ? ` · ${moderationCount}` : ''}
          </a>
          <a
            href="#comments"
            className={`${chipClass(false)} ${commentsCount > 0 ? 'border-amber-400' : ''}`}
          >
            Комментарии{commentsCount > 0 ? ` · ${commentsCount}` : ''}
          </a>
          <a href="/admin/providers" className={chipClass(false)}>
            Исполнители
          </a>
          <a href="/admin/funnel" className={chipClass(false)}>
            Воронка
          </a>
          <a href="/admin/feed" className={chipClass(false)}>
            Уведомления
          </a>
        </nav>
      </div>

      <form action="/admin/search" className="flex gap-2">
        <input
          type="search"
          name="q"
          placeholder="Найти по телефону или имени"
          aria-label="Найти по телефону или имени"
          className="min-h-[44px] min-w-0 flex-1 rounded-full border border-slate-300 bg-white px-4 text-sm"
        />
        <button type="submit" className="cab-action">
          Найти
        </button>
      </form>

      <SignupCounters stats={stats} />

      {/* Daily actions right under the top: moderation of chat orders,
          comments and reviews. Empty ones take one line; the calls follow. */}
      <Card className="flex scroll-mt-24 flex-col gap-3" id="moderation">
        <div>
          <h2 className="font-semibold">
            Заявки из мессенджеров на модерации{' '}
            <span className="text-amber-700">({moderationCount})</span>
          </h2>
          <p className="text-sm text-slate-600">
            Уверенные заявки из чатов публикуются на торгах сразу, сомнительные ждут здесь. За 7
            дней импортировано:{' '}
            {importedStats.length === 0
              ? '0'
              : importedStats.map((s) => `${SOURCE_LABELS[s.source]} — ${s._count}`).join(', ')}
            .
          </p>
        </div>
        {pendingOrders.length === 0 && (
          <p className="text-sm text-slate-500">Заявок на модерации нет.</p>
        )}
        {pendingOrders.map((order) => (
          <div
            key={order.id}
            className="flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:justify-between"
          >
            <div className="min-w-0 text-sm">
              <p className="whitespace-pre-wrap">{order.rawText ?? order.description}</p>
              <p className="mt-1 text-xs text-slate-500">
                {SOURCE_LABELS[order.source]}
                {order.sourceChat ? ` · ${order.sourceChat}` : ''}
                {order.category ? ` · ${order.category.name}` : ''}
                {order.location ? ` · ${order.location.city}` : ''}
                {order.contactName ? ` · ${order.contactName}` : ''}
                {order.contactPhone && (
                  <>
                    {' · '}
                    <PhoneLink phone={order.contactPhone} />
                  </>
                )}
              </p>
            </div>
            <div className="flex flex-col items-start gap-2">
              <ModerationButtons orderId={order.id} />
              <EraseOrderButton orderId={order.id} />
            </div>
          </div>
        ))}
      </Card>

      <Card className="flex scroll-mt-24 flex-col gap-3" id="comments">
        <div>
          <h2 className="font-semibold">
            Комментарии и отзывы на модерации{' '}
            <span className="text-amber-700">({commentsCount})</span>
          </h2>
          <p className="text-sm text-slate-600">
            Заказчики пишут об исполнителях, исполнители — о заказчиках. На сайте и в приложении
            видны только опубликованные; телефоны, e-mail и ссылки скрыты автоматически. Отзыв
            целиком (звёзды и текст) появляется и входит в рейтинг только после публикации.
          </p>
        </div>
        {commentsCount === 0 && (
          <p className="text-sm text-slate-500">Новых комментариев и отзывов нет.</p>
        )}
        {pendingReviews.map((review) => (
          <div
            key={review.id}
            className="flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:justify-between"
          >
            <div className="min-w-0 text-sm">
              <p className="text-amber-500">
                {'★'.repeat(review.rating)}
                {'☆'.repeat(5 - review.rating)}{' '}
                <span className="text-xs font-semibold text-slate-600">Отзыв</span>
              </p>
              {review.comment ? (
                <p className="whitespace-pre-wrap break-words">{review.comment}</p>
              ) : (
                <p className="text-slate-500">Только оценка, без текста</p>
              )}
              <p className="mt-1 text-xs text-slate-500">
                {review.author.name} ({review.author.email}) → «{review.company.name}»
                {review.equipment ? `, ${review.equipment.name}` : ''} ·{' '}
                {review.createdAt.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}
              </p>
            </div>
            <CommentModerationButtons commentId={review.id} kind="reviews" />
          </div>
        ))}
        {pendingComments.map((comment) => (
          <div
            key={comment.id}
            className="flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:justify-between"
          >
            <div className="min-w-0 text-sm">
              <p className="whitespace-pre-wrap break-words">{comment.text}</p>
              <p className="mt-1 text-xs text-slate-500">
                {comment.author.name} ({comment.author.email}) →{' '}
                {comment.targetCompany
                  ? `исполнитель «${comment.targetCompany.name}»`
                  : `заказчик ${comment.targetUser?.name ?? ''}`}{' '}
                · {comment.createdAt.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}
              </p>
            </div>
            <CommentModerationButtons commentId={comment.id} />
          </div>
        ))}
      </Card>

      <section className="flex scroll-mt-24 flex-col gap-3" id="leads">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Заявки на звонок</h2>
          <nav aria-label="Фильтр звонков" className="flex flex-wrap gap-1.5">
            {LEAD_FILTERS.map((item) => (
              <a
                key={item.id}
                href={leadsHref(item.id)}
                aria-current={item.id === leadFilter ? 'page' : undefined}
                className={chipClass(item.id === leadFilter)}
              >
                {item.label} · {leadCounts[item.id]}
              </a>
            ))}
          </nav>
        </div>
        {leadList.shown.length === 0 ? (
          <Card>
            {leads.length === 0
              ? 'Заявок пока нет. Они появятся здесь, как только клиенты заполнят форму.'
              : 'В этом списке заявок нет.'}
          </Card>
        ) : (
          leadList.shown.map((lead) => (
            <Card
              key={lead.id}
              className={`flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between ${
                lead.status === 'NEW' ? 'border-amber-300' : ''
              }`}
            >
              <div className="min-w-0">
                <div className="font-semibold">
                  {lead.name} · <PhoneLink phone={lead.phone} />
                </div>
                {lead.message && (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{lead.message}</p>
                )}
                <p className="mt-1 text-xs text-slate-500">
                  {lead.createdAt.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}
                  {leadSourceLabel(lead.source) ? ` · ${leadSourceLabel(lead.source)}` : ''}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <LeadStatusSelect id={lead.id} status={lead.status} />
                <LeadOutcome id={lead.id} outcome={lead.outcome} amount={lead.amount} />
              </div>
            </Card>
          ))
        )}
        {leadList.hidden > 0 && (
          <p className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
            Показаны {leadList.shown.length} из {leadList.total}.
            <a
              href={showAllHref(
                '/admin',
                { leads: leadFilter === 'all' ? undefined : leadFilter },
                'leads',
              )}
              className="cab-action"
            >
              Показать ещё {leadList.hidden}
            </a>
          </p>
        )}
        {showAll && leadsTotal > leads.length && (
          <p className="text-xs text-slate-500">
            Загружены последние {leads.length} из {leadsTotal}; более старые —{' '}
            <a href="/admin/search" className="underline">
              через поиск
            </a>
            .
          </p>
        )}
      </section>

      <Card className="flex flex-col gap-4">
        <div>
          <h2 className="font-semibold">Маркетинг: откуда заявки за 30 дней</h2>
          <p className="text-sm text-slate-600">
            Заявок: {recentLeads.length}. Канал запоминается на 30 дней: реклама с UTM-метками,
            Яндекс Директ, поиск, 2ГИС, Авито, соцсети. Помечайте ссылки в рекламе меткой utm_source
            — тогда здесь будет видно, какая реклама окупается.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {reports.map(([title, rows]) => (
            <div key={title}>
              <h3 className="text-sm font-semibold">{title}</h3>
              {rows.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">Пока нет заявок.</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-2">
                  {rows.map(([name, count, deals, dealSum]) => (
                    <li key={name} className="text-sm">
                      <div className="flex justify-between gap-3">
                        <span className="truncate">{name}</span>
                        <span className="font-mono tabular-nums">
                          {count} · {Math.round((count / recentLeads.length) * 100)}%
                        </span>
                      </div>
                      {deals > 0 && (
                        <p className="text-xs text-emerald-700">
                          Сделок: {deals} на {dealSum.toLocaleString('ru-RU')} ₽
                        </p>
                      )}
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-amber-500"
                          style={{ width: `${(count / recentLeads.length) * 100}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          Яндекс.Метрика:{' '}
          {metrikaReady
            ? `подключена, счётчик ${SITE.metrikaId}. Цели: lead (заявка), call, whatsapp, telegram, email.`
            : 'не подключена. Создайте бесплатный счётчик на metrika.yandex.ru и пришлите номер — пропишем NEXT_PUBLIC_YANDEX_METRIKA_ID.'}
        </p>
      </Card>

      {/* Reference and one-time setup: collapsed, the daily work is above. */}
      <details className="rounded-xl border border-slate-200 bg-white p-4" id="settings">
        <summary className="cursor-pointer font-semibold">
          Настройки и справочники: исполнители, мессенджеры, парк компании, донаты
        </summary>
        <div className="mt-4 flex flex-col gap-6">
          <Card className="flex flex-col gap-3" id="providers">
            <div>
              <h2 className="font-semibold">
                Исполнители · {providers.length} · проверено{' '}
                {providers.filter((company) => company.verified).length}
              </h2>
              <p className="text-sm text-slate-600">
                Отметка «Проверен» видна заказчикам в предложениях и на странице исполнителя.
                Ставьте её после звонка и проверки ИНН и документов на технику.
              </p>
            </div>
            {providers.length === 0 ? (
              <p className="text-sm text-slate-500">Исполнителей пока нет.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-slate-100">
                {providers.map((company) => (
                  <li
                    key={company.id}
                    className="flex flex-col gap-2 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <a
                        href={providerPath(company.id)}
                        className="break-words font-medium hover:text-amber-700"
                      >
                        {company.name}
                      </a>
                      <p className="text-xs text-slate-500">
                        Техники: {company._count.equipment}
                        {company.taxId ? ` · ИНН ${company.taxId}` : ''}
                        {company.phone ? ` · ${company.phone}` : ''}
                        {company.baseAddress ? ` · ${company.baseAddress}` : ''} · с{' '}
                        {company.createdAt.toLocaleDateString('ru-RU')}
                      </p>
                    </div>
                    <AdminVerifyToggle companyId={company.id} initial={company.verified} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="flex flex-col gap-4">
            <div>
              <h2 className="font-semibold">Подключение мессенджеров</h2>
              <p className="text-sm text-slate-600">
                Заявки из групп и чатов автоматически попадают к вам в заявки и в Telegram — на
                сайте их видите только вы. Реклама и болтовня отсекаются.
              </p>
            </div>
            <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
              <h3 className="text-sm font-semibold">Telegram</h3>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
                <li>
                  В Telegram у @BotFather: /newbot → получите токен → добавьте его в Vercel как
                  TELEGRAM_BOT_TOKEN → Redeploy.
                </li>
                <li>Нажмите кнопку ниже — бот начнёт присылать сообщения на сайт.</li>
                <li>
                  У @BotFather: /setprivacy → выберите бота → Disable (чтобы бот видел все сообщения
                  в группах).
                </li>
                <li>
                  Добавьте бота в нужные группы (в каналы — администратором). Клиенты могут писать и
                  боту напрямую.
                </li>
              </ol>
              <TelegramSetupButton
                configured={Boolean(process.env.TELEGRAM_BOT_TOKEN) && tgSecretReady}
              />
            </div>
            <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
              <h3 className="text-sm font-semibold">WhatsApp (через Green API)</h3>
              <p className="text-sm text-slate-600">
                У WhatsApp нет официального способа читать группы, поэтому используется шлюз
                green-api.com: зарегистрируйтесь, создайте инстанс, отсканируйте QR-код с отдельного
                номера (лучше не основного — неофициальные шлюзы нарушают правила WhatsApp и номер
                могут заблокировать). В настройках инстанса вставьте URL и токен ниже и включите
                «Получать уведомления о входящих сообщениях».
              </p>
              {whatsappToken && (
                <>
                  <CopyField
                    label="URL для уведомлений"
                    value={`${origin}/api/integrations/whatsapp`}
                  />
                  <CopyField label="Токен (webhookUrlToken)" value={whatsappToken} />
                </>
              )}
            </div>
            <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
              <h3 className="text-sm font-semibold">Другие источники (n8n, Make, парсеры)</h3>
              <p className="text-sm text-slate-600">
                POST JSON{' '}
                {
                  '{ "text": "...", "source": "telegram|whatsapp|other", "chat": "...", "author": "...", "phone": "..." }'
                }{' '}
                с заголовком Authorization: Bearer &lt;токен&gt;.
              </p>
              {inboundToken && (
                <>
                  <CopyField label="URL" value={`${origin}/api/integrations/inbound`} />
                  <CopyField label="Токен" value={inboundToken} />
                </>
              )}
            </div>
          </Card>

          <Card className="flex flex-col gap-3">
            <div>
              <h2 className="font-semibold">Парк компании в каталоге</h2>
              <p className="text-sm text-slate-600">
                Техника СпецПласт16 публикуется в каталоге автоматически. Чтобы менять цены и
                статусы, зарегистрируйтесь на сайте и привяжите аккаунт:
              </p>
            </div>
            <LinkOwnerForm />
            {houseManagers.length > 0 && (
              <p className="text-sm text-slate-600">
                Управляют парком:{' '}
                {houseManagers.map((user) => `${user.name} (${user.email})`).join(', ')}
              </p>
            )}
          </Card>

          <Card className="flex flex-col gap-3" id="support">
            <div>
              <h2 className="font-semibold">Поддержка приложения (донаты)</h2>
              <p className="text-sm text-slate-600">
                После завершённого заказа заказчик и исполнитель видят ненавязчивое предложение
                поддержать площадку любой суммой — переводом по номеру карты в своём банке. Номер
                хранится только здесь и показывается, пока предложение включено.
              </p>
            </div>
            <SupportSettingsForm />
          </Card>
        </div>
      </details>
    </div>
  );
}
