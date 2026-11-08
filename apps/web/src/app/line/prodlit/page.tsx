import type { Metadata } from 'next';
import Link from 'next/link';
import { Card } from '@specai/ui';
import { verifyLineRenewToken } from '@/lib/lineRenew';
import { RenewButton } from './RenewButton';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Продлить линию',
  robots: { index: false, follow: false },
};

/**
 * The link in «Продлить на 5 рабочих дней?» (lib/lineRenewData.ts). Opening
 * it changes nothing (mail scanners and link previews open links first): the
 * provider taps the one button. No sign-in needed; nothing personal shown.
 */
export default function LineRenewPage({
  searchParams = {},
}: {
  searchParams?: { t?: string | string[] };
}) {
  const token = typeof searchParams.t === 'string' ? searchParams.t : '';
  const valid = verifyLineRenewToken(token) !== null;
  return (
    <div className="mx-auto max-w-md py-10">
      <Card className="flex flex-col gap-3">
        <h1 className="text-xl font-bold">Остаться на линии</h1>
        {valid ? (
          <>
            <p className="text-sm text-slate-700">
              Заказчики продолжат видеть вашу машину на карте и получать её в подборе по заявкам
              рядом ещё 5 рабочих дней (пн–пт).
            </p>
            <RenewButton token={token} />
          </>
        ) : (
          <p className="text-sm text-slate-700">
            Ссылка недействительна. Продлить или выключить линию можно в{' '}
            <Link href="/provider#line" className="text-amber-700 underline">
              разделе «На линии»
            </Link>
            .
          </p>
        )}
      </Card>
    </div>
  );
}
