import type { Metadata } from 'next';
import { CallbackForm } from '@/components/CallbackForm';
import { TelegramButton } from '@/components/TelegramButton';
import { DELIVERY_NOTE, shiftExample } from '@/lib/cities';
import { JOBS, jobMachineLabel, jobRate } from '@/lib/jobs';
import { fromPrice, MIN_RATE } from '@/lib/prices';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Работы спецтехникой в Набережных Челнах — цены с машинистом',
  description: `Траншеи, котлованы, септики, вывоз снега, демонтаж, планировка, краны и автовышки: техника ${SITE.name} ${fromPrice(MIN_RATE)} с машинистом. ${DELIVERY_NOTE}`,
  alternates: { canonical: '/raboty' },
};

export default function JobsIndexPage() {
  return (
    <div className="flex flex-col gap-10">
      <section className="rounded-[2rem] bg-slate-950 px-6 py-10 text-white shadow-2xl sm:px-10 sm:py-14">
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
            className="rounded-md bg-amber-500 px-5 py-3 font-semibold text-slate-950 hover:bg-amber-400"
          >
            {SITE.phone}
          </a>
          <TelegramButton page="/raboty" dark />
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {JOBS.map((job) => {
          const rate = jobRate(job);
          return (
            <a
              key={job.slug}
              href={`/raboty/${job.slug}`}
              className="flex h-full flex-col gap-2 rounded-xl border border-slate-200 bg-white p-5 hover:border-amber-400"
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
            </a>
          );
        })}
      </section>

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
