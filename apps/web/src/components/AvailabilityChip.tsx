import type { EquipmentStatus } from '@specai/ui';

const OTHER_STATUS: Record<
  Exclude<EquipmentStatus, 'AVAILABLE'>,
  { label: string; dot: string }
> = {
  RENTED: { label: 'В аренде', dot: 'bg-sky-500' },
  IN_MAINTENANCE: { label: 'На обслуживании', dot: 'bg-amber-500' },
  RETIRED: { label: 'Не сдаётся', dot: 'bg-slate-400' },
};

// «Свободна» with a pulsing green dot, or the machine's current status.
export function AvailabilityChip({
  status,
  className = '',
}: {
  status: EquipmentStatus;
  className?: string;
}) {
  if (status === 'AVAILABLE') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-600/15 ${className}`}
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:animate-none" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        Свободна
      </span>
    );
  }
  const other = OTHER_STATUS[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-900/5 ${className}`}
    >
      <span className={`h-2 w-2 rounded-full ${other.dot}`} />
      {other.label}
    </span>
  );
}
