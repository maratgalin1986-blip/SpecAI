import { Icon } from '@/components/Icon';
import { HOUSE_DELIVERY_PROMISE, SNEG_PATH, snegPackageLine } from '@/lib/sneg';

// The home page's seasonal line (shown November–March, lib/sneg.ts isSnowSeason):
// one link to /uborka-snega with the package's prices from lib/prices.ts.
export function SnegHomeLink() {
  return (
    <a
      href={SNEG_PATH}
      data-testid="sneg-home-link"
      className="show-card flex flex-col gap-3 rounded-3xl bg-slate-950 p-5 text-white sm:flex-row sm:items-center sm:justify-between sm:p-6"
    >
      <span className="min-w-0">
        <span className="eyebrow block text-sky-300">Сезон: ноябрь — март</span>
        <span className="mt-1 block text-lg font-bold sm:text-xl">Уборка и вывоз снега</span>
        <span className="mt-1 block text-sm text-slate-300">
          С машинистами: {snegPackageLine()}. {HOUSE_DELIVERY_PROMISE}.
        </span>
      </span>
      <span className="inline-flex min-h-11 shrink-0 items-center gap-2 self-start rounded-full bg-amber-500 px-5 font-semibold text-slate-950 sm:self-center">
        Подробнее <Icon name="arrow" className="h-4 w-4" />
      </span>
    </a>
  );
}
