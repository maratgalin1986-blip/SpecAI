import { isDisplayableImage } from '@/lib/providerMap';
import { isHouseEquipment } from '@/lib/fleet';
import type { EquipmentStatus } from '@specai/ui';
import { AvailabilityChip } from '@/components/AvailabilityChip';
import { Icon, type IconName } from '@/components/Icon';
import { MachinePhoto } from '@/components/MachinePhoto';
import { QuickOrder } from '@/components/QuickOrder';
import { TiltCard } from '@/components/TiltCard';
import {
  customerRates,
  headlinePrices,
  keySpecs,
  machineTypeOf,
  rub,
  specChip,
  taskGroupOf,
} from '@/lib/equipmentCatalog';
import { modelPhotosOf } from '@/lib/modelPhotos';

type Amount = number | string | { toString(): string } | null;

export interface EquipmentCardItem {
  id: string;
  name: string;
  status: EquipmentStatus;
  hourlyRate: Amount;
  dailyRate: Amount;
  specs: unknown;
  imageUrls: string[];
  category: { name: string };
  location: { city: string } | null;
  /** Owner of the machine; the house fleet gets a «Парк СпецПласт16» badge. */
  companyId?: string;
  company?: { name: string } | null;
}

const GROUP_ICON: Record<ReturnType<typeof taskGroupOf>, IconName> = {
  earth: 'excavator',
  lifting: 'crane',
  loading: 'loader',
  transport: 'tractor',
  other: 'helmet',
};

export function categoryIcon(categoryName: string): IconName {
  if (/бульдоз|трактор/i.test(categoryName)) return 'tractor';
  return GROUP_ICON[taskGroupOf(categoryName)];
}

// Catalog card: photo (or a drawn placeholder), availability, key specs,
// hourly and per-shift price, and the quick-order / details actions.
export function EquipmentCard({ item }: { item: EquipmentCardItem }) {
  const href = `/equipment/${item.id}`;
  const { hour, shift } = headlinePrices(
    customerRates({ ...item, categoryName: item.category.name }),
  );
  const chips = keySpecs(item.specs, 3).map(specChip);
  // Only https photos or the site's own paths (never javascript: or data:).
  const ownPhoto = item.imageUrls.find(isDisplayableImage);
  // No own photo yet: a photo of the same model, labelled «Фото модели».
  const modelPhoto = ownPhoto ? undefined : modelPhotosOf(item.name)[0];
  const photo = ownPhoto ?? modelPhoto;
  const illustration = photo ? null : machineTypeOf(item.category.name, item.name);
  const priceSummary = [hour !== null && `${rub(hour)}/ч`, shift !== null && `${rub(shift)}/смена`]
    .filter(Boolean)
    .join(', ');

  return (
    <TiltCard max={6} className="rounded-3xl border border-slate-200 bg-white">
      <article className="group/card flex h-full flex-col" data-vt-id={item.id}>
        <a
          href={href}
          className="relative block aspect-[2/1] overflow-hidden"
          data-vt-part="photo"
          tabIndex={-1}
        >
          {photo ? (
            <>
              <img
                src={photo}
                alt={item.name}
                loading="lazy"
                className="tilt-zoom h-full w-full object-cover"
              />
              {modelPhoto && (
                <span className="absolute bottom-2 right-3 rounded bg-slate-950/50 px-1.5 text-[0.6rem] text-white/85">
                  Фото модели
                </span>
              )}
            </>
          ) : illustration ? (
            <>
              <MachinePhoto
                type={illustration}
                sizes="(min-width: 1024px) 380px, (min-width: 640px) 50vw, 100vw"
                className="tilt-zoom absolute inset-0"
              />
              <span className="absolute bottom-2 right-3 text-[0.6rem] text-white/70">
                Фото для примера
              </span>
            </>
          ) : (
            <div className="relative flex h-full w-full items-center justify-center bg-slate-950 bg-[radial-gradient(ellipse_at_30%_20%,rgba(245,158,11,0.18),transparent_60%)]">
              <div
                className="absolute inset-0 opacity-[0.12] [background-image:linear-gradient(rgba(255,255,255,.5)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.5)_1px,transparent_1px)] [background-size:28px_28px]"
                aria-hidden
              />
              <Icon
                name={categoryIcon(item.category.name)}
                className="relative h-20 w-20 text-amber-400 transition duration-500 group-hover/card:scale-110"
              />
            </div>
          )}
          <AvailabilityChip status={item.status} className="absolute left-3 top-3 shadow-sm" />
        </a>

        <div className="flex flex-1 flex-col gap-4 p-5">
          <div>
            <div className="eyebrow text-[0.65rem] text-slate-500">
              {item.category.name}
              {item.location && ` · ${item.location.city}`}
            </div>
            <h2
              className="mt-1.5 text-lg font-bold leading-snug tracking-tight"
              data-vt-part="title"
            >
              <a href={href} className="hover:text-amber-700">
                {item.name}
              </a>
            </h2>
            {item.companyId && (
              <p className="mt-1 text-xs font-medium text-slate-500">
                {isHouseEquipment(item) ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
                    Парк СпецПласт16
                  </span>
                ) : (
                  item.company?.name
                )}
              </p>
            )}
          </div>

          {chips.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="Характеристики">
              {chips.map((chip) => (
                <li
                  key={chip}
                  className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
                >
                  {chip}
                </li>
              ))}
            </ul>
          )}

          <dl className="mt-auto grid grid-cols-2 overflow-hidden rounded-2xl border border-slate-200">
            <div className="border-r border-slate-200 px-3 py-2.5">
              <dt className="eyebrow text-[0.6rem] text-slate-500">Час</dt>
              <dd
                className="mt-0.5 whitespace-nowrap font-mono text-base font-semibold tabular-nums text-slate-900"
                data-vt-part="price"
              >
                {hour !== null ? rub(hour) : <span className="text-slate-500">по запросу</span>}
              </dd>
            </div>
            <div className="px-3 py-2.5">
              <dt className="eyebrow text-[0.6rem] text-slate-500">Смена 8 ч</dt>
              <dd className="mt-0.5 whitespace-nowrap font-mono text-base font-semibold tabular-nums text-slate-900">
                {shift !== null ? rub(shift) : <span className="text-slate-500">по запросу</span>}
              </dd>
            </div>
          </dl>

          <QuickOrder
            equipmentId={item.id}
            equipmentName={item.name}
            priceSummary={priceSummary}
            detailsHref={href}
          />
        </div>
      </article>
    </TiltCard>
  );
}
