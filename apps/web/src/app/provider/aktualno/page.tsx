import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { HOUSE_NOT_ASKED, loadAktualno } from '@/lib/aktualnoData';
import { isHouseManager, isProvider } from '@/lib/fleet';
import { AktualnoForm } from '@/components/AktualnoForm';
import { SITE } from '@/lib/site';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Цены и свободные дни',
  description: 'Обновите цены и свободные дни своей техники за 30 секунд.',
  robots: { index: false },
};

/**
 * «Актуализация»: the quick page the weekly message leads to. Every machine
 * of the provider's company with its price and «Свободна …», one «Сохранить».
 */
export default async function AktualnoPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login?callbackUrl=/provider/aktualno');
  if (!isProvider(session.user)) redirect('/dashboard');
  const companyId = session.user.companyId;

  if (isHouseManager(session.user)) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <h1 className="text-2xl font-extrabold text-graphite-950">Цены и свободные дни</h1>
        <p className="cab-card text-sm text-graphite-700">{HOUSE_NOT_ASKED}.</p>
        <a href="/provider" className="text-sm font-semibold text-signal-700 hover:underline">
          ← В кабинет
        </a>
      </div>
    );
  }

  const machines = await loadAktualno(companyId);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div className="flex flex-col gap-1">
        <p className="cab-eyebrow">{SITE.platform}</p>
        <h1 className="text-2xl font-extrabold tracking-tight text-graphite-950">
          Цены и свободные дни
        </h1>
        <p className="text-sm text-graphite-600">
          Проверьте цену и отметьте, когда машина свободна, — заказчики видят актуальную технику
          первой. Отметка «Свободна…» показывается в каталоге 7 дней.
        </p>
      </div>
      {machines.length === 0 ? (
        <p className="cab-card text-sm text-graphite-700">
          У компании пока нет техники на площадке.{' '}
          <a href="/provider#add-equipment" className="font-semibold text-signal-700 underline">
            Добавьте первую машину
          </a>
          .
        </p>
      ) : (
        <AktualnoForm machines={machines} />
      )}
      <a href="/provider" className="text-sm font-semibold text-signal-700 hover:underline">
        ← В кабинет
      </a>
    </div>
  );
}
