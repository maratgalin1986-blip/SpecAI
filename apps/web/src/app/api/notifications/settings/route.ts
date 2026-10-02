import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { getRequestUser } from '@/lib/requestUser';
import { INVALID_JSON_MESSAGE, readJson } from '@/lib/apiInput';
import { serverChannels } from '@/lib/notifications/adapters';
import { loadRecipient } from '@/lib/notifications/notifyUser';
import { applyPrefsUpdate, settingsView } from '@/lib/notifications/settingsView';

export const dynamic = 'force-dynamic';

/**
 * Каналы уведомлений текущего пользователя (сайт — сессия, приложение — Bearer):
 * Telegram, push, e-mail, WhatsApp и SMS («скоро», пока не настроены на сервере).
 */
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: 'Необходимо войти в аккаунт' }, { status: 401 });
  const loaded = await loadRecipient(user.id);
  if (!loaded) return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 });
  return NextResponse.json(settingsView(loaded.prefs, loaded.recipient, serverChannels()));
}

/** { telegram?: boolean, push?: boolean, email?: boolean, whatsapp?: boolean, sms?: boolean } */
export async function PUT(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: 'Необходимо войти в аккаунт' }, { status: 401 });
  const body = await readJson(request);
  if (body === null) return NextResponse.json({ error: INVALID_JSON_MESSAGE }, { status: 400 });

  const loaded = await loadRecipient(user.id);
  if (!loaded) return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 });
  const server = serverChannels();
  const update = applyPrefsUpdate(loaded.prefs, body, server);
  if (!update.ok) return NextResponse.json({ error: update.error }, { status: 400 });

  await prisma.notificationSettings.upsert({
    where: { userId: user.id },
    update: update.prefs,
    create: { userId: user.id, ...update.prefs },
  });
  return NextResponse.json(settingsView(update.prefs, loaded.recipient, server));
}

/** The app's API client knows PATCH, the site uses PUT: both do the same. */
export const PATCH = PUT;
