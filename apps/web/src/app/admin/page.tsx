import type { Metadata } from 'next';
import { prisma } from '@specai/database';
import { Card } from '@specai/ui';
import { AdminLogin, AdminLogout } from '@/components/AdminLogin';
import { LeadOutcome } from '@/components/LeadOutcome';
import { LeadStatusSelect } from '@/components/LeadStatusSelect';
import { LinkOwnerForm } from '@/components/LinkOwnerForm';
import { CommentModerationButtons } from '@/components/Comments';
import { ModerationButtons, CopyField, TelegramSetupButton } from '@/components/AdminIntegrations';
import { headers } from 'next/headers';
import { inboundApiToken, telegramWebhookSecret, whatsappWebhookToken } from '@/lib/integrations';
import { isAdminConfigured, isAdminRequest } from '@/lib/admin';
import { SITE } from '@/lib/site';
import { formLabel, splitSource } from '@/lib/marketing';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Заявки на звонок', robots: { index: false } };

const SOURCE_LABELS: Record<string, string> = {
  SITE: 'Сайт',
  TELEGRAM: 'Telegram',
  WHATSAPP: 'WhatsApp',
  OTHER: 'Другое',
};

function siteOrigin() {
  const h = headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export default async function AdminPage() {
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

  const leads = await prisma.lead.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
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
  const origin = siteOrigin();
  const tgSecretReady = Boolean(telegramWebhookSecret());
  const whatsappToken = whatsappWebhookToken();
  const inboundToken = inboundApiToken();
  const newCount = leads.filter((lead) => lead.status === 'NEW').length;
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Панель управления</h1>
          <p className="text-slate-600">
            Заявок на звонок — новых:{' '}
            <span className="font-semibold text-amber-700">{newCount}</span> · всего {leads.length}
          </p>
        </div>
        <AdminLogout />
      </div>

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

      <Card className="flex flex-col gap-3">
        <div>
          <h2 className="font-semibold">
            Заявки из мессенджеров на модерации{' '}
            <span className="text-amber-700">({pendingOrders.length})</span>
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
                {order.contactPhone ? ` · ${order.contactPhone}` : ''}
              </p>
            </div>
            <ModerationButtons orderId={order.id} />
          </div>
        ))}
      </Card>

      <Card className="flex flex-col gap-3" id="comments">
        <div>
          <h2 className="font-semibold">
            Комментарии на модерации{' '}
            <span className="text-amber-700">({pendingComments.length})</span>
          </h2>
          <p className="text-sm text-slate-600">
            Заказчики пишут об исполнителях, исполнители — о заказчиках. На сайте и в приложении
            видны только опубликованные; телефоны, e-mail и ссылки скрыты автоматически.
          </p>
        </div>
        {pendingComments.length === 0 && (
          <p className="text-sm text-slate-500">Новых комментариев нет.</p>
        )}
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

      <Card className="flex flex-col gap-4">
        <div>
          <h2 className="font-semibold">Подключение мессенджеров</h2>
          <p className="text-sm text-slate-600">
            Заявки из групп и чатов автоматически попадают к вам в заявки и в Telegram — на сайте их
            видите только вы. Реклама и болтовня отсекаются.
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
              У @BotFather: /setprivacy → выберите бота → Disable (чтобы бот видел все сообщения в
              группах).
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
            номера (лучше не основного — неофициальные шлюзы нарушают правила WhatsApp и номер могут
            заблокировать). В настройках инстанса вставьте URL и токен ниже и включите «Получать
            уведомления о входящих сообщениях».
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
            Техника СпецПласт16 публикуется в каталоге автоматически. Чтобы менять цены и статусы,
            зарегистрируйтесь на сайте и привяжите аккаунт:
          </p>
        </div>
        <LinkOwnerForm />
      </Card>

      {leads.length === 0 ? (
        <Card>Заявок пока нет. Они появятся здесь, как только клиенты заполнят форму.</Card>
      ) : (
        <div className="flex flex-col gap-3">
          {leads.map((lead) => (
            <Card
              key={lead.id}
              className={`flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between ${
                lead.status === 'NEW' ? 'border-amber-300' : ''
              }`}
            >
              <div className="min-w-0">
                <div className="font-semibold">
                  {lead.name} ·{' '}
                  <a href={`tel:${lead.phone.replace(/[^\d+]/g, '')}`} className="text-amber-700">
                    {lead.phone}
                  </a>
                </div>
                {lead.message && (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{lead.message}</p>
                )}
                <p className="mt-1 text-xs text-slate-500">
                  {lead.createdAt.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}
                  {lead.source ? ` · ${lead.source}` : ''}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <LeadStatusSelect id={lead.id} status={lead.status} />
                <LeadOutcome id={lead.id} outcome={lead.outcome} amount={lead.amount} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
