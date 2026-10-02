import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { getRequestUser } from '@/lib/requestUser';
import { isProvider } from '@/lib/fleet';
import { INVALID_JSON_MESSAGE, readJson } from '@/lib/apiInput';
import { checkRateLimit } from '@/lib/rateLimit';
import { getBlobToken } from '@/lib/blob';
import { resolveProviderBase } from '@/lib/providerBase';
import { isAllowedPinImage, isDisplayableImage, sanitizePinNote } from '@/lib/providerMap';

// The provider's own point on the customers' map (/map): the base address or
// point, the marker picture (a photo of its own machinery or an upload) and a
// short note. GET returns the current values and the photos to choose from;
// PATCH changes whichever fields are sent. Web session or mobile Bearer.

const PIN_SELECT = {
  id: true,
  name: true,
  baseLat: true,
  baseLon: true,
  baseAddress: true,
  pinImageUrl: true,
  pinNote: true,
} as const;

/** Photos of the company's own machinery (newest first, without repeats). */
async function ownPhotos(companyId: string): Promise<string[]> {
  const rows = await prisma.equipment.findMany({
    where: { companyId },
    select: { imageUrls: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return [...new Set(rows.flatMap((row) => row.imageUrls))].filter(isDisplayableImage).slice(0, 40);
}

const FORBIDDEN = { error: 'Точку на карте меняет только аккаунт поставщика' };

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!isProvider(user)) return NextResponse.json(FORBIDDEN, { status: 403 });
  const [company, photos] = await Promise.all([
    prisma.company.findUnique({ where: { id: user.companyId }, select: PIN_SELECT }),
    ownPhotos(user.companyId),
  ]);
  if (!company) return NextResponse.json({ error: 'Компания не найдена' }, { status: 404 });
  return NextResponse.json({ company, photos, uploadsEnabled: Boolean(getBlobToken()) });
}

export async function PATCH(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!isProvider(user)) return NextResponse.json(FORBIDDEN, { status: 403 });

  if (!checkRateLimit(`company-pin:${user.id}`, { limit: 20, windowMs: 60_000 }).ok) {
    return NextResponse.json({ error: 'Слишком часто, попробуйте через минуту' }, { status: 429 });
  }

  const body = await readJson(request);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: INVALID_JSON_MESSAGE }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  const data: {
    baseLat?: number;
    baseLon?: number;
    baseAddress?: string | null;
    pinImageUrl?: string | null;
    pinNote?: string | null;
  } = {};

  // The base: a new point or a new address replaces the old one; it cannot be
  // removed, a provider always has a place on the map.
  if ('baseLat' in input || 'baseLon' in input || 'baseAddress' in input) {
    const base = await resolveProviderBase(input);
    if (!base.ok) return NextResponse.json({ error: base.error }, { status: 400 });
    Object.assign(data, base.value);
  }

  if ('pinNote' in input) {
    const note = sanitizePinNote(input.pinNote);
    if (!note.ok) return NextResponse.json({ error: note.error }, { status: 400 });
    data.pinNote = note.value;
  }

  if ('pinImageUrl' in input) {
    const value = input.pinImageUrl;
    if (value === null || value === '') {
      data.pinImageUrl = null; // the standard icon
    } else if (
      typeof value === 'string' &&
      isAllowedPinImage(value, {
        companyId: user.companyId,
        ownImageUrls: await ownPhotos(user.companyId),
      })
    ) {
      data.pinImageUrl = value;
    } else {
      return NextResponse.json(
        { error: 'Для значка выберите фото своей техники или загрузите новое' },
        { status: 400 },
      );
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Нечего сохранять' }, { status: 400 });
  }

  const company = await prisma.company.update({
    where: { id: user.companyId },
    data,
    select: PIN_SELECT,
  });
  return NextResponse.json({ company });
}
