// What the settings screens (site cabinet and the app's profile) show for
// each channel: the checkbox, whether it can be switched on, and a hint.
// Pure, unit-tested; GET/PUT /api/notifications/settings return it.
import {
  CHANNELS,
  CHANNEL_LABELS,
  channelReachable,
  isRealEmail,
  phoneDigits,
  type Channel,
  type ChannelPrefs,
  type Recipient,
  type ServerChannels,
} from './routing';

export interface ChannelView {
  id: Channel;
  label: string;
  enabled: boolean;
  /** false — the checkbox is disabled («скоро» or not set up). */
  available: boolean;
  /** The channel will actually deliver right now (chosen + reachable). */
  active: boolean;
  /** Marked «скоро» (the paid adapter is not switched on on the server). */
  soon: boolean;
  hint: string;
}

export interface SettingsView {
  channels: ChannelView[];
  telegram: { linked: boolean; botConfigured: boolean };
  push: { devices: number };
}

function hintFor(channel: Channel, recipient: Recipient, server: ServerChannels): string {
  switch (channel) {
    case 'telegram':
      if (!server.telegram) return 'Бот ещё не подключён на сервере';
      return recipient.telegramChatId
        ? 'Бот подключён — сообщения приходят в Telegram'
        : 'Нажмите «Подключить Telegram» и запустите бота';
    case 'push':
      return (recipient.pushTokens?.length ?? 0) > 0
        ? `Устройств с приложением: ${recipient.pushTokens!.length}`
        : 'Войдите в мобильное приложение и разрешите уведомления';
    case 'email':
      if (!server.email) return 'Отправка писем пока не настроена';
      return isRealEmail(recipient.email) ? `На ${recipient.email}` : 'Нет адреса e-mail';
    case 'whatsapp':
    case 'sms':
      if (!server[channel]) return 'Скоро';
      return phoneDigits(recipient.phone)
        ? `На номер ${recipient.phone}`
        : 'Укажите телефон в профиле';
  }
}

export function settingsView(
  prefs: ChannelPrefs,
  recipient: Recipient,
  server: ServerChannels,
): SettingsView {
  return {
    channels: CHANNELS.map((id) => {
      const paid = id === 'whatsapp' || id === 'sms';
      const available = paid ? server[id] : true;
      return {
        id,
        label: CHANNEL_LABELS[id],
        // A paid channel that is not set up is shown unchecked whatever is stored.
        enabled: available && prefs[id],
        available,
        active: prefs[id] && channelReachable(id, recipient, server),
        soon: paid && !server[id],
        hint: hintFor(id, recipient, server),
      };
    }),
    telegram: { linked: Boolean(recipient.telegramChatId), botConfigured: server.telegram },
    push: { devices: recipient.pushTokens?.length ?? 0 },
  };
}

/**
 * Applies a PUT body to the stored choice: only known channels with boolean
 * values; WhatsApp and SMS cannot be switched on while they are «скоро».
 */
export function applyPrefsUpdate(
  current: ChannelPrefs,
  body: unknown,
  server: ServerChannels,
): { ok: true; prefs: ChannelPrefs } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Пустой запрос' };
  const input = body as Record<string, unknown>;
  const next = { ...current };
  let touched = false;
  for (const channel of CHANNELS) {
    if (!(channel in input)) continue;
    const value = input[channel];
    if (typeof value !== 'boolean') return { ok: false, error: `Неверное значение: ${channel}` };
    if (value && (channel === 'whatsapp' || channel === 'sms') && !server[channel]) {
      return { ok: false, error: `${CHANNEL_LABELS[channel]} скоро появится` };
    }
    next[channel] = value;
    touched = true;
  }
  return touched ? { ok: true, prefs: next } : { ok: false, error: 'Нет изменений' };
}
