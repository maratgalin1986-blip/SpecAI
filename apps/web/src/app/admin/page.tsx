import type { Metadata } from 'next';
import { prisma } from '@specai/database';
import { Card } from '@specai/ui';
import { AdminLogin, AdminLogout } from '@/components/AdminLogin';
import { LeadStatusSelect } from '@/components/LeadStatusSelect';
import { LinkOwnerForm } from '@/components/LinkOwnerForm';
import { ModerationButtons, CopyField, TelegramSetupButton } from '@/components/AdminIntegrations';
import { headers } from 'next/headers';
import { inboundApiToken, telegramWebhookSecret, whatsappWebhookToken } from '@/lib/integrations';
import { isAdminConfigured, isAdminRequest } from '@/lib/admin';

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
  const origin = siteOrigin();
  const tgSecretReady = Boolean(telegramWebhookSecret());
  const whatsappToken = whatsappWebhookToken();
  const inboundToken = inboundApiToken();
  const newCount = leads.filter((lead) => lead.status === 'NEW').length;

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

      <Card className="flex flex-col gap-4">
        <div>
          <h2 className="font-semibold">Подключение мессенджеров</h2>
          <p className="text-sm text-slate-600">
            Заявки из групп и чатов автоматически попадают на сайт на торги. Реклама других
            поставщиков и болтовня отсекаются.
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
              <LeadStatusSelect id={lead.id} status={lead.status} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
