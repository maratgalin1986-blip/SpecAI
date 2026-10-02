import type { Metadata } from 'next';
import { CinemaHero } from '@/components/CinemaHero';
import { SmetaCalculator } from '@/components/SmetaCalculator';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Рассчитать смету на спецтехнику',
  description: `Примерная смета на работу спецтехники ${SITE.name} в Набережных Челнах: траншея, котлован, планировка, вывоз грунта, кран, автовышка — техника, часы и цена с машинистом.`,
};

export default function SmetaPage({ searchParams }: { searchParams: { job?: string } }) {
  return (
    <div className="flex flex-col gap-6">
      <CinemaHero
        eyebrow="Калькулятор"
        title="Примерная смета за минуту"
        clips={['site-aerial']}
        camera={5}
        still
      />
      <p className="max-w-2xl text-slate-600">
        Выберите работу и размеры — посчитаем, какая техника {SITE.name} нужна, на сколько часов и
        сколько это примерно стоит. Смета примерная: точную цену назовёт диспетчер.
      </p>
      <SmetaCalculator initialJob={searchParams.job} />
    </div>
  );
}
