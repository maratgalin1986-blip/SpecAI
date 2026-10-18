import { NextRequest, NextResponse } from 'next/server';
import { HOUSE_COMPANY_ID } from '@specai/database';
import { getRequestUser } from '@/lib/requestUser';
import { INVALID_JSON_MESSAGE, readJson } from '@/lib/apiInput';
import { canAnswerPriceAsk, parseAktualnoBody } from '@/lib/aktualno';
import { HOUSE_NOT_ASKED, loadAktualno, saveAktualno } from '@/lib/aktualnoData';

export const dynamic = 'force-dynamic';

const NOT_PROVIDER = 'Обновлять цены может руководитель компании-исполнителя';

function refuse(user: { role?: string | null; companyId?: string | null } | null) {
  if (!user) return NextResponse.json({ error: 'Необходимо войти в аккаунт' }, { status: 401 });
  if (user.role === 'PROVIDER_ADMIN' && user.companyId === HOUSE_COMPANY_ID) {
    return NextResponse.json({ error: HOUSE_NOT_ASKED }, { status: 403 });
  }
  return NextResponse.json({ error: NOT_PROVIDER }, { status: 403 });
}

/**
 * «Актуализация» (site and app): the company's machines with their prices and
 * free day, for the quick page. Only a provider manager, only his own company,
 * never the house fleet.
 */
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!canAnswerPriceAsk(user)) return refuse(user);
  const machines = await loadAktualno(user.companyId);
  return NextResponse.json({ machines });
}

/** { items: [{ id, hourlyRate, dailyRate, availability: { kind, until? } }] } — one «Сохранить». */
export async function PUT(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!canAnswerPriceAsk(user)) return refuse(user);
  const body = await readJson(request);
  if (body === null) return NextResponse.json({ error: INVALID_JSON_MESSAGE }, { status: 400 });
  const parsed = parseAktualnoBody(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const saved = await saveAktualno(user, parsed.items);
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status });
  return NextResponse.json({ ok: true, saved: saved.saved, message: AKTUALNO_SAVED });
}

const AKTUALNO_SAVED = 'Сохранено. Спасибо — заказчики увидят актуальные цены и свободные дни.';

/** The app's API client may send PATCH: the same as PUT. */
export const PATCH = PUT;
