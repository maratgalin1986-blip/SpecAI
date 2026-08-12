export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

const statusStyles: Record<BookingStatus, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  CONFIRMED: 'bg-blue-100 text-blue-800',
  ACTIVE: 'bg-green-100 text-green-800',
  COMPLETED: 'bg-slate-200 text-slate-600',
  CANCELLED: 'bg-red-100 text-red-800',
};

const statusLabels: Record<BookingStatus, string> = {
  PENDING: 'Ожидает подтверждения',
  CONFIRMED: 'Подтверждена',
  ACTIVE: 'Активна',
  COMPLETED: 'Завершена',
  CANCELLED: 'Отменена',
};

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusStyles[status]}`}
    >
      {statusLabels[status]}
    </span>
  );
}
