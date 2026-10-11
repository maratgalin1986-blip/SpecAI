import { SITE } from './site';
/**
 * Шаблоны email-уведомлений (простой HTML на русском).
 * Каждая функция возвращает { subject, html, text } для sendEmail.
 */

export type EmailTemplate = { subject: string; html: string; text: string };

export type BookingStatusValue = 'PENDING' | 'CONFIRMED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export const BOOKING_STATUS_LABELS: Record<BookingStatusValue, string> = {
  PENDING: 'ожидает подтверждения',
  CONFIRMED: 'подтверждено',
  ACTIVE: 'в работе',
  COMPLETED: 'завершено',
  CANCELLED: 'отменено',
};

export function getEmailBaseUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
  return url.replace(/\/+$/, '');
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

type PriceLike = number | string | { toString(): string };

export function formatPrice(amount: PriceLike, currency: string): string {
  const numeric = Number(typeof amount === 'object' ? amount.toString() : amount);
  const formatted = Number.isFinite(numeric)
    ? new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(numeric)
    : String(amount);
  return `${formatted} ${currency}`;
}

export function formatDate(date: Date | string): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) {
    return String(date);
  }
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(value);
}

function layout(title: string, paragraphs: string[], link?: { href: string; label: string }) {
  const body = paragraphs.map((p) => `<p style="margin:0 0 12px">${p}</p>`).join('\n');
  const button = link
    ? `<p style="margin:20px 0"><a href="${escapeHtml(link.href)}" style="display:inline-block;padding:10px 18px;background:#0f766e;color:#ffffff;text-decoration:none;border-radius:6px">${escapeHtml(link.label)}</a></p>
<p style="margin:0 0 12px;color:#6b7280;font-size:13px">Или откройте ссылку: <a href="${escapeHtml(link.href)}">${escapeHtml(link.href)}</a></p>`
    : '';
  return `<!doctype html>
<html lang="ru">
<body style="margin:0;padding:24px;background:#f9fafb;font-family:Arial,Helvetica,sans-serif;color:#111827;font-size:15px;line-height:1.5">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px">
<h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(title)}</h1>
${body}
${button}
<p style="margin:24px 0 0;color:#6b7280;font-size:13px">Это автоматическое письмо от платформы ${SITE.name}. Отвечать на него не нужно.</p>
</div>
</body>
</html>`;
}

function plain(title: string, lines: string[], link?: string): string {
  return [title, '', ...lines, ...(link ? ['', `Ссылка: ${link}`] : []), '', `— ${SITE.name}`].join(
    '\n',
  );
}

// ---------------------------------------------------------------------------

export type NewBidReceivedParams = {
  orderId: string;
  orderDescription: string;
  equipmentName: string;
  price: PriceLike;
  currency: string;
  message?: string | null;
};

/** Клиенту: по вашей заявке поступило новое предложение. */
export function newBidReceived(params: NewBidReceivedParams): EmailTemplate {
  const url = `${getEmailBaseUrl()}/orders/${params.orderId}`;
  const price = formatPrice(params.price, params.currency);
  const title = 'Новое предложение по вашей заявке';
  const subject = `${SITE.name}: новое предложение по заявке — ${params.equipmentName}`;

  const lines = [
    `По вашей заявке «${params.orderDescription}» поступило новое предложение.`,
    `Техника: ${params.equipmentName}`,
    `Цена: ${price}`,
    ...(params.message ? [`Сообщение исполнителя: ${params.message}`] : []),
    'Откройте заявку, чтобы принять предложение или сравнить его с другими.',
  ];

  return {
    subject,
    html: layout(title, lines.map(escapeHtml), { href: url, label: 'Открыть заявку' }),
    text: plain(title, lines, url),
  };
}

export type BidAcceptedParams = {
  bookingId: string;
  equipmentName: string;
  price: PriceLike;
  currency: string;
  startDate: Date | string;
  endDate: Date | string;
  customerName?: string | null;
};

/** Поставщику: ваше предложение принято, создано бронирование. */
export function bidAccepted(params: BidAcceptedParams): EmailTemplate {
  const url = `${getEmailBaseUrl()}/dashboard`;
  const title = 'Ваше предложение принято';
  const subject = `${SITE.name}: предложение принято — ${params.equipmentName}`;

  const lines = [
    `Клиент${params.customerName ? ` ${params.customerName}` : ''} принял ваше предложение по технике «${params.equipmentName}».`,
    `Создано бронирование № ${params.bookingId}.`,
    `Период: ${formatDate(params.startDate)} — ${formatDate(params.endDate)}`,
    `Стоимость: ${formatPrice(params.price, params.currency)}`,
    'Подтвердите бронирование в личном кабинете.',
  ];

  return {
    subject,
    html: layout(title, lines.map(escapeHtml), { href: url, label: 'Перейти в кабинет' }),
    text: plain(title, lines, url),
  };
}

export type BookingStatusChangedParams = {
  bookingId: string;
  equipmentName: string;
  status: BookingStatusValue;
  startDate: Date | string;
  endDate: Date | string;
};

/** Клиенту: статус бронирования изменён. */
export function bookingStatusChanged(params: BookingStatusChangedParams): EmailTemplate {
  const url = `${getEmailBaseUrl()}/dashboard`;
  const label = BOOKING_STATUS_LABELS[params.status] ?? params.status;
  const title = 'Статус бронирования изменён';
  const subject = `${SITE.name}: бронирование ${label} — ${params.equipmentName}`;

  const lines = [
    `Статус вашего бронирования техники «${params.equipmentName}» изменён: ${label}.`,
    `Бронирование № ${params.bookingId}.`,
    `Период: ${formatDate(params.startDate)} — ${formatDate(params.endDate)}`,
    'Подробности — в личном кабинете.',
  ];

  return {
    subject,
    html: layout(title, lines.map(escapeHtml), { href: url, label: 'Открыть кабинет' }),
    text: plain(title, lines, url),
  };
}

export type PaymentReceivedParams = {
  bookingId: string;
  equipmentName: string;
  amount: PriceLike;
  currency: string;
  /** Кому адресовано письмо: клиенту или поставщику. */
  recipient: 'customer' | 'provider';
};

/** Клиенту и поставщику: оплата получена. */
export function paymentReceived(params: PaymentReceivedParams): EmailTemplate {
  const url = `${getEmailBaseUrl()}/dashboard`;
  const amount = formatPrice(params.amount, params.currency);
  const title = 'Оплата получена';
  const subject = `${SITE.name}: оплата получена — ${params.equipmentName}`;

  const lines =
    params.recipient === 'customer'
      ? [
          `Мы получили вашу оплату ${amount} за бронирование техники «${params.equipmentName}».`,
          `Бронирование № ${params.bookingId} подтверждено.`,
          `Спасибо, что пользуетесь ${SITE.name}!`,
        ]
      : [
          `Клиент оплатил ${amount} за бронирование техники «${params.equipmentName}».`,
          `Бронирование № ${params.bookingId} подтверждено.`,
          'Подробности — в личном кабинете.',
        ];

  return {
    subject,
    html: layout(title, lines.map(escapeHtml), { href: url, label: 'Открыть кабинет' }),
    text: plain(title, lines, url),
  };
}

export type PasswordResetParams = { resetUrl: string };

/** Пользователю: ссылка для сброса пароля. */
export function passwordReset(params: PasswordResetParams): EmailTemplate {
  const title = 'Сброс пароля';
  const subject = `${SITE.name}: сброс пароля`;

  const lines = [
    `Вы запросили сброс пароля для аккаунта ${SITE.name}.`,
    'Перейдите по ссылке ниже, чтобы задать новый пароль. Ссылка действует 1 час.',
    'Если вы не запрашивали сброс, просто проигнорируйте это письмо — пароль останется прежним.',
  ];

  return {
    subject,
    html: layout(title, lines.map(escapeHtml), {
      href: params.resetUrl,
      label: 'Задать новый пароль',
    }),
    text: plain(title, lines, params.resetUrl),
  };
}

export type EmailVerifyParams = { verifyUrl: string };

/** Пользователю: ссылка для подтверждения email. */
export function emailVerify(params: EmailVerifyParams): EmailTemplate {
  const title = 'Подтвердите email';
  const subject = `${SITE.name}: подтвердите email`;

  const lines = [
    `Спасибо за регистрацию в ${SITE.name}!`,
    'Подтвердите адрес электронной почты, перейдя по ссылке ниже. Ссылка действует 24 часа.',
    'Если вы не создавали аккаунт, просто проигнорируйте это письмо.',
  ];

  return {
    subject,
    html: layout(title, lines.map(escapeHtml), {
      href: params.verifyUrl,
      label: 'Подтвердить email',
    }),
    text: plain(title, lines, params.verifyUrl),
  };
}
