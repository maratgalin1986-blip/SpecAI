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
import { prefsFrom, providerMatchesOrder, type NotificationEvent, type Recipient } from './routing';

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

/**
 * A new order on the board (from the site, a chat, or published by the
 * admin): every provider with machinery of that category nearby hears of it.
 */
export async function notifyProvidersAboutOrder(orderId: string): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { category: { select: { name: true } }, location: true },
    });
    if (!order || order.status !== 'OPEN') return;

    const companies = await prisma.company.findMany({
      where: { isProvider: true },
      select: {
        id: true,
        baseLat: true,
        baseLon: true,
        equipment: {
          where: { status: { not: 'RETIRED' } },
          select: { categoryId: true },
          distinct: ['categoryId'],
        },
        users: {
          where: { role: 'PROVIDER_ADMIN' },
          select: { id: true },
        },
      },
      take: 1000,
    });
    const userIds = companies
      .filter((company) =>
        providerMatchesOrder(
          {
            categoryIds: company.equipment.map((item) => item.categoryId),
            baseLat: company.baseLat,
            baseLon: company.baseLon,
          },
          {
            categoryId: order.categoryId,
            lat: order.location?.latitude,
            lon: order.location?.longitude,
          },
        ),
      )
      .flatMap((company) => company.users.map((user) => user.id))
      .filter((id) => id !== order.customerId)
      .slice(0, MAX_ORDER_RECIPIENTS);

    await notifyUsers(userIds, {
      type: 'order.new',
      orderId: order.id,
      description: order.description,
      categoryName: order.category?.name,
      city: order.location?.city,
      startDate: order.desiredStartDate,
      fromChat: order.source !== 'SITE',
    });
  } catch (error) {
    console.error(`[notify] new order ${orderId}: providers were not notified`, error);
  }
}
