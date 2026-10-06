import type { Metadata } from 'next';
import { CinemaHero } from '@/components/CinemaHero';
import { SmetaCalculator } from '@/components/SmetaCalculator';
import { SITE } from '@/lib/site';
import { OBJECTS, type ObjectType } from '@/lib/smetaProject';

export const metadata: Metadata = {
  title: 'Рассчитать смету на спецтехнику',
  description: `Примерная смета на работу спецтехники ${SITE.name} в Набережных Челнах: проект целиком по этапам с 3D-схемой, траншея, котлован, планировка, вывоз грунта, кран, автовышка. Смета для снабженца: материалы с запасом и доставка.`,
};

export default function SmetaPage({
  searchParams,
}: {
  searchParams: {
    job?: string;
    mode?: string;
    object?: string;
    length?: string;
    width?: string;
    floors?: string;
  };
}) {
  const snab = searchParams.mode === 'snab';
  // Sizes from the design project (/dizain): ?object=house&length=10&width=8&floors=2.
  const num = (v?: string) => (v && Number.isFinite(Number(v)) ? Number(v) : undefined);
  const initialProject =
    searchParams.object && searchParams.object in OBJECTS
      ? {
          object: searchParams.object as ObjectType,
          length: num(searchParams.length),
          width: num(searchParams.width),
          floors: num(searchParams.floors),
        }
      : undefined;
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
      <SmetaCalculator
        initialJob={searchParams.job}
        initialAudience={snab ? 'snab' : 'foreman'}
        initialProject={initialProject}
      />
    </div>
  );
}
