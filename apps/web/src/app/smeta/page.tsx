import type { Metadata } from 'next';
import { CinemaHero } from '@/components/CinemaHero';
import { SmetaCalculator } from '@/components/SmetaCalculator';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Рассчитать смету на спецтехнику',
  description: `Примерная смета на работу спецтехники ${SITE.name} в Набережных Челнах: проект целиком по этапам с 3D-схемой, траншея, котлован, планировка, вывоз грунта, кран, автовышка. Смета для снабженца: материалы с запасом и доставка.`,
};

export default function SmetaPage({
  searchParams,
}: {
  searchParams: { job?: string; mode?: string };
}) {
  const snab = searchParams.mode === 'snab';
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CinemaHero
        eyebrow="Калькулятор"
        title={snab ? 'Смета для снабженца' : 'Примерная смета за минуту'}
        clips={['site-aerial']}
        camera={5}
        still
      />
      <p className="max-w-2xl text-slate-600">
        Опишите стройку или одну работу — посчитаем по шагам, какая техника {SITE.name} нужна, на
        сколько часов, сколько дней и сколько это примерно стоит. Смета примерная: точную цену
        назовёт диспетчер {SITE.name}.
      </p>
      {!snab && (
        <a
          href="/smeta?mode=snab"
          className="inline-flex min-h-12 items-center justify-center self-start rounded-full bg-amber-400 px-6 font-semibold text-slate-950 shadow-lg shadow-amber-500/30 hover:bg-amber-300"
        >
          📦 Смета для снабженца
        </a>
      )}
      <SmetaCalculator initialJob={searchParams.job} initialAudience={snab ? 'snab' : 'foreman'} />
    </div>
  );
}
