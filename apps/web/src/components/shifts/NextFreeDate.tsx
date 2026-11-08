import { loadNextFreeDate } from '@/lib/calendarStore';
import { freeFromLabel } from '@/lib/occupancy';

// «Свободна с …» on the public machine page: the next day without bookings,
// pending requests or manual blocks (lib/occupancy.ts). An async server
// component, awaited by the page.

export async function NextFreeDate({ equipment }: { equipment: { id: string; status: string } }) {
  if (equipment.status === 'RETIRED') return null;
  let next: string | null = null;
  try {
    next = await loadNextFreeDate(equipment);
  } catch (error) {
    console.error('[calendar] next free date failed', error);
    return null;
  }
  const label = freeFromLabel(next);
  const free = next !== null;
  return (
    <p
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        free
          ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/15'
          : 'bg-slate-100 text-slate-600'
      }`}
      aria-label={`Ближайшая свободная дата: ${label}`}
    >
      <span className={`h-2 w-2 rounded-full ${free ? 'bg-emerald-500' : 'bg-slate-400'}`} />
      {label}
    </p>
  );
}
