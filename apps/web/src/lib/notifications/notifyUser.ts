// The single entry point for user notifications: notifyUser(userId, event).
// Loads the user's channel choice, linked Telegram chat and app devices, then
// hands over to deliver(). Never throws — a failed notification must not
// break the order, bid or booking that triggered it.
import { HOUSE_COMPANY_ID, prisma } from '@specai/database';
import { siteUrl } from '../siteUrl';
import {
  sendEmailNotification,
  sendExpoPush,
  sendSms,
  sendTelegramMessage,
  sendWhatsApp,
  serverChannels,
} from './adapters';
import { deliver, type DeliverDeps, type DeliverOptions, type DeliveryReport } from './deliver';
import { orderPoint } from '../geo';
import {
  acceptedCategoryIds,
  prefsFrom,
  providerMatchesOrder,
  type NotificationEvent,
  type Recipient,
} from './routing';
import {
  companyHasPriority,
  EARLY_NOTICE_MS,
  planOrderNotice,
  type OrderRecipient,
} from '../referralPriority';

function liveDeps(): DeliverDeps {
  return {
    server: serverChannels(),
    baseUrl: siteUrl(),
    send: {
      telegram: sendTelegramMessage,
      push: sendExpoPush,
      email: sendEmailNotification,
      whatsapp: sendWhatsApp,
      sms: sendSms,
    },
    onInvalidPushTokens: (tokens) =>
      prisma.pushToken.deleteMany({ where: { token: { in: tokens } } }).catch(() => undefined),
    ownerTelegramChatId: process.env.TELEGRAM_CHAT_ID?.trim() || null,
  };
}

export async function loadRecipient(userId: string) {
  const [user, settings, tokens] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { email: true, phone: true } }),
    prisma.notificationSettings.findUnique({ where: { userId } }),
    prisma.pushToken.findMany({ where: { userId }, select: { token: true }, take: 10 }),
  ]);
  if (!user) return null;
  const recipient: Recipient = {
    userId,
    email: user.email,
    phone: user.phone,
    telegramChatId: settings?.telegramChatId ?? null,
    pushTokens: tokens.map((row) => row.token),
  };
  return { recipient, prefs: prefsFrom(settings) };
}

export async function notifyUser(
  userId: string,
  event: NotificationEvent,
  options?: DeliverOptions,
): Promise<DeliveryReport> {
  try {
    const loaded = await loadRecipient(userId);
    if (!loaded) return {};
    const report = await deliver(loaded.recipient, loaded.prefs, event, liveDeps(), options);
    for (const [channel, result] of Object.entries(report)) {
      if (result && !result.ok) {
        console.warn(`[notify] ${event.type} → ${channel} failed: ${result.error}`);
      }
    }
    return report;
  } catch (error) {
    console.error(`[notify] ${event.type} for ${userId} failed`, error);
    return {};
  }
}

export async function notifyUsers(
  userIds: string[],
  event: NotificationEvent,
  options?: DeliverOptions,
): Promise<void> {
  const unique = [...new Set(userIds)];
  // Small batches: a popular order must not open hundreds of sockets at once.
  for (let i = 0; i < unique.length; i += 10) {
    await Promise.all(unique.slice(i, i + 10).map((id) => notifyUser(id, event, options)));
  }
}

/** Managers (PROVIDER_ADMIN) of a provider company. */
export async function notifyCompany(
  companyId: string,
  event: NotificationEvent,
  options?: DeliverOptions,
): Promise<void> {
  try {
    const users = await prisma.user.findMany({
      where: { companyId, role: 'PROVIDER_ADMIN' },
      select: { id: true },
    });
    await notifyUsers(
      users.map((user) => user.id),
      event,
      options,
    );
  } catch (error) {
    console.error(`[notify] ${event.type} for company ${companyId} failed`, error);
  }
}

/** Platform admins and the owner's fleet account (in addition to TELEGRAM_CHAT_ID). */
export async function notifyAdmins(event: NotificationEvent): Promise<void> {
  try {
    const users = await prisma.user.findMany({
      where: {
        OR: [{ role: 'PLATFORM_ADMIN' }, { role: 'PROVIDER_ADMIN', companyId: HOUSE_COMPANY_ID }],
      },
      select: { id: true },
      take: 20,
    });
    await notifyUsers(
      users.map((user) => user.id),
      event,
    );
  } catch (error) {
    console.error(`[notify] ${event.type} for admins failed`, error);
  }
}

const MAX_ORDER_RECIPIENTS = 300;

/** The order fields a new-order alert is built from. */
const ORDER_FOR_NOTICE = {
  category: { select: { name: true } },
  location: true,
} as const;

/**
 * Which providers hear of an OPEN order: the managers (PROVIDER_ADMIN) of
 * every company with machinery of that category nearby, never the order's
 * own customer. `priority` marks a company holding the «Пригласи друга» bonus
 * (lib/referralPriority.ts); those come first, so the cap never cuts them.
 * Null when the order is gone or no longer OPEN. Shared by the alert at
 * publication and the deferred one (lib/deferredOrderNotices.ts).
 */
export async function matchOrderRecipients(orderId: string, now: Date = new Date()) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: ORDER_FOR_NOTICE,
  });
  if (!order || order.status !== 'OPEN') return null;

  const [companies, categoryRows] = await Promise.all([
    prisma.company.findMany({
      where: { isProvider: true },
      select: {
        id: true,
        baseLat: true,
        baseLon: true,
        baseAddress: true,
        deliveryRadiusKm: true,
        equipment: {
          where: { status: { not: 'RETIRED' } },
          select: { categoryId: true },
          distinct: ['categoryId'],
        },
        users: {
          where: { role: 'PROVIDER_ADMIN' },
          select: { id: true, priorityUntil: true },
        },
      },
      take: 1000,
    }),
    prisma.equipmentCategory.findMany({ select: { id: true, slug: true, parentId: true } }),
  ]);
  const point = orderPoint(order.location);
  const target = {
    categoryId: order.categoryId,
    categoryIds: acceptedCategoryIds(order.categoryId, categoryRows),
    lat: point?.lat,
    lon: point?.lon,
    // The city text, for an order whose point is unknown: the house fleet and
    // providers whose base names that town hear of it. No location at all:
    // no city either — only the house fleet (no default town).
    city: order.location?.city || null,
  };
  const seen = new Set<string>([order.customerId]);
  const recipients: OrderRecipient[] = [];
  for (const company of companies) {
    const matches = providerMatchesOrder(
      {
        categoryIds: company.equipment.map((item) => item.categoryId),
        baseLat: company.baseLat,
        baseLon: company.baseLon,
        radiusKm: company.deliveryRadiusKm,
        baseAddress: company.baseAddress,
        isHouse: company.id === HOUSE_COMPANY_ID,
      },
      target,
    );
    if (!matches) continue;
    const priority = companyHasPriority(company.users, now);
    const house = company.id === HOUSE_COMPANY_ID;
    for (const user of company.users) {
      if (seen.has(user.id)) continue;
      seen.add(user.id);
      recipients.push({ userId: user.id, priority, house });
    }
  }
  // Stable sort: the bonus holders and the house fleet first, so the cap
  // never cuts them; the rest keep their order.
  const rank = (item: OrderRecipient) => (item.priority ? 2 : item.house ? 1 : 0);
  recipients.sort((a, b) => rank(b) - rank(a));
  return { order, recipients: recipients.slice(0, MAX_ORDER_RECIPIENTS) };
}

type OrderForNotice = NonNullable<Awaited<ReturnType<typeof matchOrderRecipients>>>['order'];

export function orderNewEvent(order: OrderForNotice, early = false): NotificationEvent {
  return {
    type: 'order.new',
    orderId: order.id,
    description: order.description,
    categoryName: order.category?.name,
    city: order.location?.city,
    startDate: order.desiredStartDate,
    fromChat: order.source !== 'SITE',
    ...(early ? { early: true } : {}),
  };
}

/**
 * A new order on the board (from the site, a chat, or published by the
 * admin): every provider with machinery of that category nearby hears of it.
 * «Пригласи друга»: when some of them hold the bonus and others do not, the
 * holders hear now and the rest 5 minutes later (othersNotifyAt, sent by
 * lib/deferredOrderNotices.ts); otherwise everyone hears at once.
 */
export async function notifyProvidersAboutOrder(orderId: string): Promise<void> {
  try {
    const now = new Date();
    const matched = await matchOrderRecipients(orderId, now);
    if (!matched) return;
    const { order, recipients } = matched;
    const plan = planOrderNotice(recipients);
    if (plan.later.length > 0) {
      const deferred = await prisma.order
        .update({
          where: { id: order.id },
          data: {
            earlyNotifiedUserIds: [...plan.now, ...plan.house],
            othersNotifyAt: new Date(now.getTime() + EARLY_NOTICE_MS),
            othersNotifiedAt: null,
          },
        })
        .then(() => true)
        .catch((error: unknown) => {
          // Could not schedule the rest: nobody waits, everyone hears now.
          console.error(`[notify] new order ${orderId}: could not defer the others`, error);
          return false;
        });
      if (deferred) {
        await notifyUsers(plan.now, orderNewEvent(order, true));
        if (plan.house.length > 0) await notifyUsers(plan.house, orderNewEvent(order));
        return;
      }
    } else if (order.othersNotifyAt && !order.othersNotifiedAt) {
      // Published again while an earlier delayed alert still waits: everyone
      // hears now, so that one must not repeat it.
      await prisma.order.updateMany({
        where: { id: order.id, othersNotifiedAt: null },
        data: { othersNotifiedAt: now },
      });
    }
    await notifyUsers([...plan.now, ...plan.house, ...plan.later], orderNewEvent(order));
  } catch (error) {
    console.error(`[notify] new order ${orderId}: providers were not notified`, error);
  }
}
