import type { Metadata } from 'next';
import { Card } from '@specai/ui';
import { prisma } from '@specai/database';
import { maskEmail, verifyUnsubscribeToken } from '@/lib/newsletter';
import { newsSubscribed } from '@/lib/newsConsent';
import { SITE } from '@/lib/site';
import { UnsubscribeButton } from './UnsubscribeButton';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Отписка от рассылки',
  robots: { index: false, follow: false },
};

/**
 * The link in «Заявки рядом за неделю». Opening it changes nothing (mail
 * scanners open links first): the person confirms with the button. The
 * address is shown masked only.
 */
export default async function UnsubscribePage({
  searchParams = {},
}: {
  searchParams?: { t?: string | string[] };
}) {
  const token = typeof searchParams.t === 'string' ? searchParams.t : '';
  const userId = verifyUnsubscribeToken(token);
  let loadFailed = false;
  const user = userId
    ? await prisma.user
        .findUnique({
          where: { id: userId },
          select: { email: true, newsConsentAt: true, newsUnsubscribedAt: true },
        })
        .catch((error: unknown) => {
          console.error('[unsubscribe] could not load the user', error);
          loadFailed = true;
          return null;
        })
    : null;

  return (
    <div className="mx-auto max-w-md py-10">
      <Card className="flex flex-col gap-3">
        <h1 className="text-xl font-bold">Рассылка «Заявки рядом за неделю»</h1>
        {loadFailed ? (
          <p className="text-sm text-slate-700">
            Не удалось открыть страницу — обновите её через минуту.
          </p>
        ) : !user ? (
          <p className="text-sm text-slate-700">
            Ссылка недействительна. Отписаться можно в настройках уведомлений после входа или
            написав на{' '}
            <a href={`mailto:${SITE.email}`} className="text-amber-700 underline">
              {SITE.email}
            </a>
            .
          </p>
        ) : !newsSubscribed(user) ? (
          <p className="text-sm text-slate-700">
            Адрес {maskEmail(user.email)} не подписан на рассылку — писем больше не будет.
          </p>
        ) : (
          <>
            <p className="text-sm text-slate-700">
              Отписать {maskEmail(user.email)} от еженедельного письма {SITE.platform}? Письма о
              ваших заявках и бронях продолжат приходить.
            </p>
            <UnsubscribeButton token={token} />
          </>
        )}
      </Card>
    </div>
  );
}
