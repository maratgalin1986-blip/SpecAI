import type { Metadata } from 'next';
import { CallbackForm } from '@/components/CallbackForm';
import { LoopVideo } from '@/components/LoopVideo';
import { Reveal } from '@/components/Reveal';
import { TelegramButton } from '@/components/TelegramButton';
import { DELIVERY_NOTE, shiftExample } from '@/lib/cities';
import { JOBS, jobMachineLabel, jobRate } from '@/lib/jobs';
import { fromPerHour, fromPrice, MIN_RATE } from '@/lib/prices';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Работы спецтехникой в Набережных Челнах — цены с машинистом',
  description: `Траншеи, котлованы, септики, вывоз снега, демонтаж, планировка, краны и автовышки: техника ${SITE.name} ${fromPerHour(MIN_RATE)}. ${DELIVERY_NOTE}`,
  alternates: { canonical: '/raboty' },
};

export default function JobsIndexPage() {
  return (
    <div className="flex flex-col gap-10">
      <section className="relative isolate overflow-hidden rounded-[2rem] bg-slate-950 px-6 py-10 text-white shadow-2xl sm:px-10 sm:py-14">
        {/* Real footage behind the header: an excavator loading a truck. */}
        <LoopVideo clip="step-work" className="absolute inset-0 -z-10 h-full w-full opacity-60" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-slate-950/95 via-slate-950/75 to-slate-950/30" />
        <nav className="text-sm text-slate-400">
          <a href="/" className="hover:text-white">
            Главная
          </a>{' '}
          / <span>Работы и цены</span>
        </nav>
        <h1 className="cine-title mt-3 text-3xl font-extrabold leading-tight sm:text-5xl">
          Работы спецтехникой и цены
        </h1>
        <p className="mt-4 max-w-2xl text-slate-300">
          Выберите, что нужно сделать, — покажем, какая машина {SITE.name} это делает, как проходит
          работа и сколько стоит смена с машинистом. {DELIVERY_NOTE}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href={SITE.phoneHref}
            className="sweep rounded-md bg-amber-500 px-5 py-3 font-semibold text-slate-950 hover:bg-amber-400"
          >
            {SITE.phone}
          </a>
          <TelegramButton page="/raboty" dark />
        </div>
      </section>

      <Reveal stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {JOBS.map((job) => {
          const rate = jobRate(job);
          return (
            <div key={job.slug}>
              <a
                href={`/raboty/${job.slug}`}
                className="lift group flex h-full flex-col gap-2 rounded-xl border border-slate-200 bg-white p-5 hover:border-amber-400"
              >
                <h2 className="text-lg font-semibold">{job.name}</h2>
                <p className="text-sm text-slate-600">{job.short}</p>
                <p className="text-xs text-slate-500">
                  {job.machines.map((m) => jobMachineLabel(m)).join(' · ')}
                </p>
                <p className="mt-auto text-lg font-semibold" data-testid="job-price">
                  {fromPrice(rate)}
                  <span className="text-sm font-normal text-slate-500"> с машинистом</span>
                </p>
                <p className="text-sm text-slate-600">Смена: {shiftExample(rate)}</p>
                <span className="text-sm font-medium text-amber-700">
                  Как проходит работа <span className="nudge">→</span>
                </span>
              </a>
            </div>
          );
        })}
      </Reveal>

      <section className="mx-auto w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-5">
        <CallbackForm source="job:index" defaultMessage="Нужна техника для работ" />
        <p className="mt-3 text-xs text-slate-500">
          <a href="/privacy" className="underline">
            Политика конфиденциальности
          </a>
        </p>
      </section>
    </div>
  );
}
