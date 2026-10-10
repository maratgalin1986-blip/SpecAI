// Sends one rendered notification to one recipient over the channels they
// chose. Dependencies are passed in, so it is unit-tested with fakes; the
// database wiring lives in ./notifyUser.ts.
import { escapeHtml, type EmailTemplate } from '../emailTemplates';
import type { DeliveryResult } from './adapters';
import {
  phoneDigits,
  pickChannels,
  plainText,
  renderNotification,
  type Channel,
  type ChannelPrefs,
  type NotificationEvent,
  type Recipient,
  type RenderedNotification,
  type ServerChannels,
} from './routing';

export interface Senders {
  telegram: (chatId: string, text: string) => Promise<DeliveryResult>;
  push: (
    tokens: string[],
    message: { title: string; body: string; data?: Record<string, string> },
  ) => Promise<DeliveryResult>;
  email: (to: string, template: EmailTemplate) => Promise<DeliveryResult>;
  whatsapp: (phoneDigits: string, text: string) => Promise<DeliveryResult>;
  sms: (phoneDigits: string, text: string) => Promise<DeliveryResult>;
}

export interface DeliverDeps {
  server: ServerChannels;
  baseUrl: string;
  send: Senders;
  /** Called with push tokens Expo reported as gone. */
  onInvalidPushTokens?: (tokens: string[]) => Promise<unknown> | unknown;
}

export interface DeliverOptions {
  /** A ready-made letter (lib/emailTemplates.ts) instead of the generic one. */
  email?: EmailTemplate;
  /** Only these channels (e.g. the test button for one channel). */
  only?: Channel[];
}

export type DeliveryReport = Partial<Record<Channel, DeliveryResult>>;

/** The generic letter for events without their own template. */
export function genericEmail(message: RenderedNotification, baseUrl: string): EmailTemplate {
  const link = `${baseUrl.replace(/\/+$/, '')}${message.path}`;
  return {
    subject: message.title,
    text: `${message.title}\n\n${message.body}\n\n${link}`,
    html:
      `<p><strong>${escapeHtml(message.title)}</strong></p>` +
      `<p>${escapeHtml(message.body).replace(/\n/g, '<br>')}</p>` +
      `<p><a href="${escapeHtml(link)}">Открыть на сайте</a></p>` +
      '<p style="color:#64748b;font-size:12px">Каналы уведомлений меняются в личном кабинете.</p>',
  };
}

export async function deliver(
  recipient: Recipient,
  prefs: ChannelPrefs,
  event: NotificationEvent,
  deps: DeliverDeps,
  options: DeliverOptions = {},
): Promise<DeliveryReport> {
  const message = renderNotification(event);
  let channels = pickChannels(prefs, recipient, deps.server);
  if (options.only) channels = channels.filter((channel) => options.only!.includes(channel));

  const send = async (channel: Channel): Promise<DeliveryResult> => {
    switch (channel) {
      case 'telegram':
        return deps.send.telegram(
          recipient.telegramChatId!,
          plainText(message, deps.baseUrl, 'telegram'),
        );
      case 'push': {
        const result = await deps.send.push(recipient.pushTokens ?? [], {
          title: message.title,
          body: message.body,
          data: { path: message.path },
        });
        if (!result.ok && result.invalidTokens?.length) {
          await deps.onInvalidPushTokens?.(result.invalidTokens);
        }
        return result;
      }
      case 'email':
        return deps.send.email(
          recipient.email!,
          options.email ?? genericEmail(message, deps.baseUrl),
        );
      case 'whatsapp':
        return deps.send.whatsapp(
          phoneDigits(recipient.phone)!,
          plainText(message, deps.baseUrl, 'whatsapp'),
        );
      case 'sms':
        return deps.send.sms(
          phoneDigits(recipient.phone)!,
          plainText(message, deps.baseUrl, 'sms'),
        );
    }
  };

  const results = await Promise.all(
    channels.map(async (channel) => {
      try {
        return [channel, await send(channel)] as const;
      } catch (error) {
        return [
          channel,
          { ok: false, error: error instanceof Error ? error.message : String(error) },
        ] as const;
      }
    }),
  );
  return Object.fromEntries(results) as DeliveryReport;
}
