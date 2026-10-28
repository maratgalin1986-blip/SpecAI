import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { clientIp } from '@/lib/loginErrors';
import { checkRateLimit } from '@/lib/rateLimit';
import { INVALID_JSON_MESSAGE, readJson, zodErrorMessage } from '@/lib/apiInput';
import { resolveProviderBase } from '@/lib/providerBase';
import { validTimeZone } from '@/lib/lineDay';
import { standingData } from '@/lib/lineStanding';
import { signMobileToken } from '@/lib/mobileAuth';
import { freeReferralCode } from '@/lib/referralStore';
import {
  QUICK_LIMIT_PER_IP,
  QUICK_LIMIT_PER_PHONE,
  formatRuPhone,
  quickPlaceholderEmail,
  quickSignupSchema,
  signQuickLoginToken,
} from '@/lib/quickProvider';

export const dynamic = 'force-dynamic';

/** Всего лёгких входов за 10 минут по всей площадке — защита от наплыва. */
const GLOBAL_LIMIT = { count: 40, windowMs: 10 * 60_000 };

const TOO_OFTEN = 'Слишком часто. Попробуйте позже или позвоните нам';

/**
 * «Встать на линию — попробовать бесплатно» (owner, 2026-10-28): гость (без
 * аккаунта) отправляет имя, телефон, вид техники, точку или город и согласия.
 * Создаются компания `provisional`, админ этой компании (без e-mail и пароля,
 * телефон «не подтверждён»), машина выбранного вида с ценой «договорная» и
 * присутствие на линии на 5 рабочих дней у базы. Ответ — токен входа на сайте
 * (`quickToken`, 10 минут, next-auth «quick») и токен приложения. Публичный
 * адрес на запись — как регистрация: лимиты по IP, номеру и в базе.
 */
export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  const byIp = checkRateLimit(`quick-provider:ip:${ip}`, QUICK_LIMIT_PER_IP);
  if (!byIp.ok) {
    return NextResponse.json(
      { error: TOO_OFTEN },
      { status: 429, headers: { 'Retry-After': String(byIp.retryAfterSec) } },
    );
  }
  const body = await readJson(request);
  if (body === null) return NextResponse.json({ error: INVALID_JSON_MESSAGE }, { status: 400 });
  const parsed = quickSignupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }
  const data = parsed.data;
  if (!checkRateLimit(`quick-provider:phone:${data.phone}`, QUICK_LIMIT_PER_PHONE).ok) {
    return NextResponse.json({ error: TOO_OFTEN }, { status: 429 });
  }

  const now = new Date();
  const [recent, samePhone, category] = await Promise.all([
    prisma.user.count({
      where: {
        quickSignup: true,
        createdAt: { gte: new Date(now.getTime() - GLOBAL_LIMIT.windowMs) },
      },
    }),
    prisma.user.findFirst({
      where: { phone: { in: [data.phone, `+${data.phone}`, formatRuPhone(data.phone)] } },
      select: { id: true },
    }),
    prisma.equipmentCategory.findFirst({
      where: { id: data.categoryId, children: { none: {} } },
      select: { id: true, name: true },
    }),
  ]);
  if (recent >= GLOBAL_LIMIT.count) {
    return NextResponse.json({ error: TOO_OFTEN }, { status: 429 });
  }
  if (samePhone) {
    // Не говорим, чей это аккаунт; телефон не подтверждён, войти «по номеру» нельзя.
    return NextResponse.json(
      {
        error:
          'Этот телефон уже есть на площадке. Войдите в свой аккаунт или позвоните нам — поможем восстановить вход',
      },
      { status: 409 },
    );
  }
  if (!category) {
    return NextResponse.json({ error: 'Выберите вид техники из списка' }, { status: 400 });
  }

  const base = await resolveProviderBase({
    baseAddress: data.city,
    baseLat: data.lat,
    baseLon: data.lon,
  });
  if (!base.ok) {
    return NextResponse.json({ error: base.error, needCity: true }, { status: base.status ?? 400 });
  }
  const timeZone = validTimeZone(data.timeZone);
  const standing = standingData('days5', now, timeZone)!;

  const referralCode = await freeReferralCode();
  const user = await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: {
        name: data.name,
        isProvider: true,
        provisional: true,
        phone: formatRuPhone(data.phone),
        ...base.value,
      },
    });
    const created = await tx.user.create({
      data: {
        name: data.name,
        email: quickPlaceholderEmail(),
        phone: formatRuPhone(data.phone),
        role: 'PROVIDER_ADMIN',
        companyId: company.id,
        quickSignup: true,
        referralCode,
      },
      select: { id: true, role: true, companyId: true },
    });
    const machine = await tx.equipment.create({
      data: {
        name: category.name,
        categoryId: category.id,
        companyId: company.id,
        dailyRate: 0,
        imageUrls: [],
        availabilityUpdatedAt: now,
      },
      select: { id: true },
    });
    await tx.linePresence.create({
      data: {
        userId: created.id,
        companyId: company.id,
        equipmentId: machine.id,
        online: false,
        lat: base.value.baseLat,
        lon: base.value.baseLon,
        timeZone,
        onlineSince: now,
        ...standing,
      },
    });
    return created;
  });

  const [quickToken, token] = await Promise.all([
    signQuickLoginToken(user.id),
    signMobileToken({ userId: user.id, role: user.role }),
  ]);
  return NextResponse.json(
    { quickToken, token, standingUntil: standing.standingUntil },
    { status: 201 },
  );
}
