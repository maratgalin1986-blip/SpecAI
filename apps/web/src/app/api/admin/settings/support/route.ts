import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import {
  formatCard,
  loadSupportSettings,
  parseSupportUpdate,
  saveSupportSettings,
  type SupportSettings,
} from '@/lib/supportSettings';

export const dynamic = 'force-dynamic';

function view(settings: SupportSettings) {
  return {
    support: {
      card: settings.card,
      cardFormatted: settings.card ? formatCard(settings.card) : '',
      recipient: settings.recipient ?? '',
      enabled: settings.enabled,
      updatedAt: settings.updatedAt,
    },
  };
}

const NO_STORE = { 'Cache-Control': 'no-store' };

/** «Поддержка приложения (донаты)» in the admin menu: the card, the name, on/off. */
export async function GET() {
  if (!isAdminRequest()) return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });
  return NextResponse.json(view(await loadSupportSettings()), { headers: NO_STORE });
}

export async function PUT(request: NextRequest) {
  if (!isAdminRequest()) return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });
  // Fields not sent keep their stored values: a partial save never wipes the card.
  const parsed = parseSupportUpdate(
    await request.json().catch(() => null),
    await loadSupportSettings(),
  );
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  return NextResponse.json(view(await saveSupportSettings(parsed.value)), { headers: NO_STORE });
}
