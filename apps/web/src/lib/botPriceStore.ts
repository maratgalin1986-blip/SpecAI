// The database side of the bot's price survey (lib/botPrices.ts): the answer
// as a PriceReport (source «telegram», the chat as a keyed hash), the
// colleagues' prices back, and the phone the person shares after «Хочу заявки
// рядом» (with the consent notice shown right before the button).
import { prisma } from '@specai/database';
import { CITIES } from '@/lib/cities';
import { LANDINGS } from '@/lib/landings';
import { notifyTelegram } from '@/lib/notify';
import {
  reporterHash,
  reporterLimited,
  savePriceReport,
  surveyAnswer,
} from '@/lib/priceReportStore';
import { categoryName } from '@specai/shared';
import { currentSurveyKey } from '@/lib/groupPriceSurvey';

/** «Хочу заявки рядом» counts for the answer of the last half hour. */
const PHONE_WINDOW_MS = 30 * 60_000;

export const chatHash = (chatId: number) => reporterHash('tg', String(chatId));

/** Saves one answer; the colleagues' prices as text, or null when the chat answered too often. */
export async function saveBotPriceReport(
  chatId: number,
  answer: { landing: number; city: number; price: number },
): Promise<string | null> {
  const landing = LANDINGS[answer.landing]!;
  const city = CITIES[answer.city]!;
  const hash = chatHash(chatId);
  if (await reporterLimited(hash)) return null;
  await savePriceReport(
    {
      categorySlug: landing.categorySlug,
      city: city.name,
      region: city.region,
      hourlyRate: answer.price,
      // While the group survey runs, a private answer counts in its results too.
      surveyKey: await currentSurveyKey(),
    },
    'telegram',
    hash,
  );
  const shown = await surveyAnswer(
    landing.categorySlug,
    { city: city.name, region: city.region },
    hash,
  );
  return shown.text;
}

/** The chat's latest answer of the last half hour, if it has no phone yet. */
export async function findPendingBotReport(chatId: number, now: Date = new Date()) {
  return prisma.priceReport.findFirst({
    where: {
      reporterHash: chatHash(chatId),
      phone: null,
      createdAt: { gte: new Date(now.getTime() - PHONE_WINDOW_MS) },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, createdAt: true, wantsOrders: true, categorySlug: true, city: true },
  });
}

/** «Хочу заявки рядом»: marks the latest answer; false when there is none to mark. */
export async function markWantsOrders(chatId: number): Promise<boolean> {
  const report = await findPendingBotReport(chatId);
  if (!report) return false;
  await prisma.priceReport.update({ where: { id: report.id }, data: { wantsOrders: true } });
  return true;
}

/**
 * The shared contact completes the answer that asked for it: name and phone
 * with the moment of consent (the notice came with the button), and the owner
 * hears of a provider who wants orders.
 */
export async function attachBotPhone(
  report: { id: string; categorySlug: string | null; city: string | null },
  phone: string,
  name: string,
): Promise<void> {
  await prisma.priceReport.update({
    where: { id: report.id },
    data: {
      phone: phone.slice(0, 30),
      contactName: name.slice(0, 100) || null,
      consentAt: new Date(),
      wantsOrders: true,
    },
  });
  try {
    await notifyTelegram(
      `Опрос цен: исполнитель хочет заявки рядом — ${
        report.categorySlug ? categoryName(report.categorySlug) : 'техника'
      }, ${report.city ?? 'город не указан'}. ` +
        `${name || 'Из Telegram'}, ${phone}. Подробнее — /admin → «Опрос цен».`,
    );
  } catch (error) {
    console.error('[telegram] price survey: owner not told', error);
  }
}
