import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@specai/database';
import { INVALID_JSON_MESSAGE, readJson, zodErrorMessage } from '@/lib/apiInput';
import { LEGAL_ENTITIES_MAX, legalEntitySchema } from '@/lib/legalEntities';
import { checkRateLimit } from '@/lib/rateLimit';
import { getRequestUser } from '@/lib/requestUser';

export const dynamic = 'force-dynamic';

const UNAUTHORIZED = { error: 'Войдите в аккаунт' };
const SELECT = {
  id: true,
  legalForm: true,
  name: true,
  inn: true,
  kpp: true,
  address: true,
  isDefault: true,
} as const;

/** Свои реквизиты (только владелец аккаунта): выбранные — первыми. */
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });
  const entities = await prisma.legalEntity.findMany({
    where: { userId: user.id },
    select: SELECT,
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    take: LEGAL_ENTITIES_MAX,
  });
  return NextResponse.json({ entities });
}

/** Добавить юрлицо / ИП; первое становится выбранным. */
export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });
  if (!checkRateLimit(`legal-entities:${user.id}`, { limit: 20, windowMs: 60 * 60_000 }).ok) {
    return NextResponse.json({ error: 'Слишком часто, попробуйте позже' }, { status: 429 });
  }
  const body = await readJson(request);
  if (body === null) return NextResponse.json({ error: INVALID_JSON_MESSAGE }, { status: 400 });
  const parsed = legalEntitySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }
  const count = await prisma.legalEntity.count({ where: { userId: user.id } });
  if (count >= LEGAL_ENTITIES_MAX) {
    return NextResponse.json(
      { error: `Не больше ${LEGAL_ENTITIES_MAX} организаций на аккаунт` },
      { status: 409 },
    );
  }
  const entity = await prisma.legalEntity.create({
    data: { ...parsed.data, userId: user.id, isDefault: count === 0 },
    select: SELECT,
  });
  return NextResponse.json({ entity }, { status: 201 });
}

const patchSchema = z.object({ id: z.string().min(1).max(40), isDefault: z.literal(true) });

/** Переключить «от кого заказываю»: только своё юрлицо. */
export async function PATCH(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });
  const parsed = patchSchema.safeParse(await readJson(request));
  if (!parsed.success) return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 });
  const own = await prisma.legalEntity.findFirst({
    where: { id: parsed.data.id, userId: user.id },
    select: { id: true },
  });
  if (!own) return NextResponse.json({ error: 'Организация не найдена' }, { status: 404 });
  await prisma.$transaction([
    prisma.legalEntity.updateMany({ where: { userId: user.id }, data: { isDefault: false } }),
    prisma.legalEntity.update({ where: { id: own.id }, data: { isDefault: true } }),
  ]);
  return NextResponse.json({ ok: true });
}

/** Удалить своё юрлицо (?id=). */
export async function DELETE(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });
  const id = request.nextUrl.searchParams.get('id') ?? '';
  const removed = await prisma.legalEntity.deleteMany({ where: { id, userId: user.id } });
  if (removed.count === 0) {
    return NextResponse.json({ error: 'Организация не найдена' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
