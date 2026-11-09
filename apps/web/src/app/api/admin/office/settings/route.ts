import { SITE_YEARLY_SETTING } from '@/lib/office/prices';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { z } from 'zod';
import { isAdminRequest } from '@/lib/admin';
import { INVALID_JSON_MESSAGE, readJson, zodErrorMessage } from '@/lib/apiInput';
import { OFFICE_SETTINGS, parsePlan } from '@/lib/office/plan';
import {
  AI_DAILY_CAP_MAX,
  OFFICE_EXTRA_SETTINGS,
  OUTREACH_MODES,
  PAY_DETAILS_MAX,
  type OutreachMode,
} from '@/lib/office/settings';

export const dynamic = 'force-dynamic';

// Настройки офиса из /admin/office (spec §6, §12): план обхода, пауза поиска, цены сайта,
// рассылка (пауза, лимит в день, адрес для ответов, WhatsApp на обычный мобильный),
// реквизиты для оплаты сайта (страница счёта /oplata/<token>, S6; пусто — убрать),
// ИИ-аналитик персональных предложений (U2: выключатель и лимит в сутки), режим рассылки
// (К2: 'approve' — письма дня по кнопке владельца, 'auto' — по крону).
// Каждое поле необязательно — сохраняются только присланные.
const price = z
  .number({ invalid_type_error: 'Цена — целое число рублей' })
  .int('Цена — целое число рублей')
  .positive('Цена должна быть больше нуля')
  .max(10_000_000, 'Слишком большая цена');

const schema = z
  .object({
    plan: z.string().max(50_000, 'План слишком длинный').optional(),
    paused: z.boolean().optional(),
    sitePrice: price.optional(),
    siteMonthly: price.optional(),
    siteYearly: price.optional(),
    outreachPaused: z.boolean().optional(),
    dailyCap: z
      .number({ invalid_type_error: 'Лимит в день — целое число' })
      .int('Лимит в день — целое число')
      .min(0, 'Лимит в день не может быть отрицательным')
      .max(1000, 'Лимит в день — не больше 1000'),
    replyTo: z
      .string()
      .trim()
      .toLowerCase()
      .email('Адрес для ответов — обычная почта вида name@example.ru')
      .max(200),
    whatsappToPhone: z.boolean().optional(),
    payDetails: z
      .string({ invalid_type_error: 'Реквизиты — обычный текст' })
      .max(PAY_DETAILS_MAX, `Реквизиты — не длиннее ${PAY_DETAILS_MAX} знаков`),
    aiOffers: z.boolean({ invalid_type_error: 'ИИ-аналитик — включён или выключен' }),
    aiDailyCap: z
      .number({ invalid_type_error: 'Лимит ИИ в день — целое число' })
      .int('Лимит ИИ в день — целое число')
      .min(0, 'Лимит ИИ в день не может быть отрицательным')
      .max(AI_DAILY_CAP_MAX, `Лимит ИИ в день — не больше ${AI_DAILY_CAP_MAX}`),
    outreachMode: z.enum(OUTREACH_MODES as [OutreachMode, ...OutreachMode[]], {
      errorMap: () => ({ message: 'Режим рассылки — «с утверждением» или «сам по расписанию»' }),
    }),
  })
  .partial();

export async function PUT(request: NextRequest) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });
  }
  const json = await readJson(request);
  if (json === null) return NextResponse.json({ error: INVALID_JSON_MESSAGE }, { status: 400 });
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }
  const input = parsed.data;
  const values: Record<string, string> = {};

  if (input.plan !== undefined) {
    const plan = parsePlan(input.plan);
    if (plan.errors.length > 0) {
      return NextResponse.json(
        { error: 'В плане есть строки с ошибками, исправьте их', errors: plan.errors },
        { status: 400 },
      );
    }
    if (plan.steps.length === 0) {
      return NextResponse.json(
        { error: 'План пустой: нужна хотя бы одна строка «агент; ниша; город»' },
        { status: 400 },
      );
    }
    values[OFFICE_SETTINGS.plan] = input.plan.trim();
    // Новый план — обход с первой строки.
    values[OFFICE_SETTINGS.cursor] = '0';
  }
  if (input.paused !== undefined) values[OFFICE_SETTINGS.paused] = input.paused ? '1' : '0';
  if (input.sitePrice !== undefined) values[OFFICE_SETTINGS.sitePrice] = String(input.sitePrice);
  if (input.siteYearly !== undefined) values[SITE_YEARLY_SETTING] = String(input.siteYearly);
  if (input.siteMonthly !== undefined) {
    values[OFFICE_SETTINGS.siteMonthly] = String(input.siteMonthly);
  }
  if (input.outreachPaused !== undefined) {
    values[OFFICE_SETTINGS.outreachPaused] = input.outreachPaused ? '1' : '0';
  }
  if (input.dailyCap !== undefined) values[OFFICE_SETTINGS.dailyCap] = String(input.dailyCap);
  if (input.replyTo !== undefined) values[OFFICE_SETTINGS.replyTo] = input.replyTo;
  if (input.whatsappToPhone !== undefined) {
    values[OFFICE_EXTRA_SETTINGS.whatsappToPhone] = input.whatsappToPhone ? '1' : '0';
  }
  if (input.payDetails !== undefined) {
    values[OFFICE_EXTRA_SETTINGS.payDetails] = input.payDetails.trim();
  }

  if (input.aiOffers !== undefined) {
    values[OFFICE_EXTRA_SETTINGS.aiOffers] = input.aiOffers ? '1' : '0';
  }
  if (input.aiDailyCap !== undefined) {
    values[OFFICE_EXTRA_SETTINGS.aiDailyCap] = String(input.aiDailyCap);
  }

  if (input.outreachMode !== undefined) {
    values[OFFICE_EXTRA_SETTINGS.outreachMode] = input.outreachMode;
  }

  const entries = Object.entries(values);
  if (entries.length === 0) {
    return NextResponse.json({ error: 'Нечего сохранять' }, { status: 400 });
  }
  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } }),
    ),
  );
  return NextResponse.json({ ok: true });
}
