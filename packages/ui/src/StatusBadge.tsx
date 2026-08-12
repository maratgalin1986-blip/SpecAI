export type EquipmentStatus = 'AVAILABLE' | 'RENTED' | 'IN_MAINTENANCE' | 'RETIRED';

const statusStyles: Record<EquipmentStatus, string> = {
  AVAILABLE: 'bg-green-100 text-green-800',
  RENTED: 'bg-blue-100 text-blue-800',
  IN_MAINTENANCE: 'bg-yellow-100 text-yellow-800',
  RETIRED: 'bg-slate-200 text-slate-600',
};

const statusLabels: Record<EquipmentStatus, string> = {
  AVAILABLE: 'Доступна',
  RENTED: 'В аренде',
  IN_MAINTENANCE: 'На обслуживании',
  RETIRED: 'Списана',
};

export function StatusBadge({ status }: { status: EquipmentStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusStyles[status]}`}
    >
      {statusLabels[status]}
    </span>
  );
}
