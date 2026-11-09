// Просмотры превью (U3, S15): сколько раз компания открыла свою страницу по ссылке из письма.
// Это сигнал для обучения офиса (learning.ts: «открыли превью») и для блока «Горячие» в
// /admin/office. Не считаем владельца площадки (он открывает превью из админки) и ботов —
// превью ссылок в мессенджерах и почте тоже бот: ссылку «открывает» сервер мессенджера.
// Учёт никогда не ломает страницу: любая ошибка базы проглатывается.

/** Боты и сборщики превью ссылок (Telegram, WhatsApp, VK, поисковики, почтовые сканеры). */
export const PREVIEW_BOT_RE =
  /bot|crawl|spider|preview|facebookexternalhit|telegram|whatsapp|vkshare|yandex|google/i;

/** Пустой User-Agent — тоже не человек с браузером. */
export function isBotAgent(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? '').trim();
  return !ua || PREVIEW_BOT_RE.test(ua);
}

/** Ровно тот запрос, что нужен учёту (prisma подходит структурно). */
export interface PreviewViewsDb {
  prospect: {
    updateMany(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
  };
}

/**
 * +1 к просмотрам по токену и время первого просмотра, если его ещё нет. Возвращает, учтён ли
 * просмотр (false — админ, бот или ошибка базы).
 */
export async function recordPreviewView(
  db: PreviewViewsDb,
  token: string,
  visitor: { isAdmin: boolean; userAgent: string | null | undefined },
  now: Date = new Date(),
): Promise<boolean> {
  if (visitor.isAdmin || isBotAgent(visitor.userAgent)) return false;
  try {
    const [counted] = await Promise.all([
      db.prospect.updateMany({
        where: { token },
        data: { previewViews: { increment: 1 }, previewLastViewedAt: now },
      }),
      db.prospect.updateMany({
        where: { token, previewViewedAt: null },
        data: { previewViewedAt: now },
      }),
    ]);
    return counted.count > 0;
  } catch {
    return false;
  }
}

/** «открыл превью ×3» для админки; null — не открывал. */
export function previewViewsLabel(views: number | null | undefined): string | null {
  return views && views > 0 ? `открыл превью ×${views}` : null;
}
