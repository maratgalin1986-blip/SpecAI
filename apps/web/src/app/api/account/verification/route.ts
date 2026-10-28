import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { INVALID_JSON_MESSAGE, readJson, zodErrorMessage } from '@/lib/apiInput';
import { isProvider } from '@/lib/fleet';
import { checkRateLimit } from '@/lib/rateLimit';
import { getRequestUser } from '@/lib/requestUser';
import { privateFileUrl, privateKeyCompany } from '@/lib/privateFiles';
import {
  FIRST_ORDER_STATUSES,
  canSubmitVerification,
  fullRegistrationSchema,
  maskAccount,
  shouldOfferFullRegistration,
  verificationStatus,
} from '@/lib/providerVerification';

export const dynamic = 'force-dynamic';

const FORBIDDEN = { error: 'Реквизиты заполняет админ компании-исполнителя' };

const COMPANY_SELECT = {
  id: true,
  name: true,
  verified: true,
  provisional: true,
  legalForm: true,
  legalName: true,
  taxId: true,
  kpp: true,
  ogrn: true,
  taxRegime: true,
  bankName: true,
  bankBik: true,
  bankAccount: true,
  verificationRequestedAt: true,
  verificationRejectedReason: true,
  verifiedAt: true,
} as const;

/**
 * GET — реквизиты своей компании, статус проверки и нужно ли предложить
 * «Завершите регистрацию». Только админ своей компании (машинист — нет).
 */
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!isProvider(user)) return NextResponse.json(FORBIDDEN, { status: 403 });
  const [company, confirmed, sts] = await Promise.all([
    prisma.company.findUnique({ where: { id: user.companyId }, select: COMPANY_SELECT }),
    prisma.booking.count({
      where: {
        equipment: { companyId: user.companyId },
        status: { in: [...FIRST_ORDER_STATUSES] },
      },
    }),
    prisma.providerDocument.findFirst({
      where: { companyId: user.companyId, kind: 'STS' },
      orderBy: { createdAt: 'desc' },
      select: { number: true, fileUrl: true, equipmentId: true },
    }),
  ]);
  if (!company) return NextResponse.json({ error: 'Компания не найдена' }, { status: 404 });
  const { bankAccount, ...rest } = company;
  return NextResponse.json({
    company: { ...rest, bankAccountMasked: maskAccount(bankAccount) },
    status: verificationStatus(company),
    offerFullRegistration: shouldOfferFullRegistration(company, confirmed),
    confirmedOrders: confirmed,
    sts,
  });
}

/**
 * PUT — «Завершите регистрацию»: форма, ИНН (с контрольной суммой), название,
 * режим, СТС (номер и фото — закрытый файл своей компании), банк по желанию.
 * Отправляет на проверку; «Проверен» ставит только админ.
 */
export async function PUT(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!isProvider(user)) return NextResponse.json(FORBIDDEN, { status: 403 });
  if (!checkRateLimit(`verification:${user.id}`, { limit: 10, windowMs: 60 * 60_000 }).ok) {
    return NextResponse.json({ error: 'Слишком часто, попробуйте позже' }, { status: 429 });
  }
  const body = await readJson(request);
  if (body === null) return NextResponse.json({ error: INVALID_JSON_MESSAGE }, { status: 400 });
  const parsed = fullRegistrationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }
  const data = parsed.data;
  // Фото СТС — только закрытый файл этой же компании, загруженный через /file.
  if (privateKeyCompany(data.stsFileKey) !== user.companyId) {
    return NextResponse.json({ error: 'Загрузите фото СТС заново' }, { status: 400 });
  }
  const file = await prisma.storedFile.findUnique({
    where: { key: data.stsFileKey },
    select: { key: true },
  });
  if (!file) return NextResponse.json({ error: 'Загрузите фото СТС заново' }, { status: 400 });

  const machine = data.stsEquipmentId
    ? await prisma.equipment.findFirst({
        where: { id: data.stsEquipmentId, companyId: user.companyId },
        select: { id: true },
      })
    : null;
  if (data.stsEquipmentId && !machine) {
    return NextResponse.json({ error: 'Машина не найдена' }, { status: 404 });
  }

  const company = await prisma.company.findUnique({
    where: { id: user.companyId },
    select: COMPANY_SELECT,
  });
  if (!company) return NextResponse.json({ error: 'Компания не найдена' }, { status: 404 });
  const status = verificationStatus(company);
  if (!canSubmitVerification(status)) {
    return NextResponse.json(
      {
        error:
          status === 'verified'
            ? 'Компания уже проверена. Чтобы изменить реквизиты, напишите нам'
            : 'Данные уже на проверке — дождитесь решения',
      },
      { status: 409 },
    );
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.company.update({
      where: { id: user.companyId },
      data: {
        legalForm: data.legalForm,
        legalName: data.legalName,
        taxId: data.inn,
        kpp: data.legalForm === 'LEGAL' ? data.kpp : null,
        ogrn: data.ogrn,
        taxRegime: data.taxRegime,
        bankName: data.bankName,
        bankBik: data.bankBik,
        bankAccount: data.bankAccount,
        verificationRequestedAt: now,
        verificationRejectedReason: null,
      },
    }),
    prisma.providerDocument.create({
      data: {
        companyId: user.companyId,
        equipmentId: machine?.id ?? null,
        kind: 'STS',
        number: data.stsNumber,
        fileUrl: privateFileUrl(data.stsFileKey),
      },
    }),
  ]);
  return NextResponse.json({ status: 'pending' });
}
