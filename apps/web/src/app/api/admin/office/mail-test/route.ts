import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import { officeMailConfig, sendOfficeTestMail, SMTP_TIMEOUT_MS } from '@/lib/office/smtp';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Проверка ящика офиса до первой рассылки (/admin/office/pisma, кнопка «Проверить ящик»):
// одно письмо с ящика самому себе. В ответе — только ok и причина словами; адрес ящика,
// пароль и имя сервера наружу не уходят.

const REASON_MAX = 200;

/** Причина отказа словами для владельца; адрес ящика и отправителя из текста вырезаются. */
function errorText(reason: string): string {
  if (reason === 'no-smtp') {
    return 'Ящик не настроен: добавьте переменные OUTREACH_SMTP_USER и OUTREACH_SMTP_PASS в настройках Vercel и пересоберите сайт.';
  }
  if (/\b535\b|invalid login|EAUTH|authentication (failed|unsuccessful)/i.test(reason)) {
    return 'Яндекс не принял пароль: нужен пароль приложения, не пароль от почты';
  }
  if (/timed? ?out|ETIMEDOUT|greeting never received/i.test(reason)) {
    return `Почтовый сервер не ответил за ${Math.round(SMTP_TIMEOUT_MS / 1000)} с`;
  }
  const config = officeMailConfig();
  let text = reason;
  for (const secret of [config?.from, config?.user, config?.pass]) {
    if (secret) text = text.split(secret).join('…');
  }
  // Любой оставшийся адрес почты тоже скрываем.
  text = text
    .replace(/[^\s<>"']+@[^\s<>"']+/g, '…')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, REASON_MAX) || 'Письмо не ушло — причина неизвестна';
}

export async function POST() {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ ok: false, error: 'Нет доступа' }, { status: 401 });
  }
  const result = await sendOfficeTestMail();
  if (result.ok) return NextResponse.json({ ok: true });
  return NextResponse.json(
    { ok: false, error: errorText(result.reason) },
    { status: result.reason === 'no-smtp' ? 503 : 502 },
  );
}
