import type { Reliability } from '@/lib/reliability';

// Trust chips of a provider company (lib/reliability.ts): «Проверен» in
// signal colours, the rest as quiet graphite chips.

export function ReliabilityBadges({
  value,
  className = '',
}: {
  value: Reliability;
  className?: string;
}) {
  return (
    <ul className={`flex flex-wrap gap-1.5 ${className}`} aria-label="Надёжность исполнителя">
      {value.badges.map((badge) => (
        <li
          key={badge}
          className={
            badge === 'Проверен'
              ? 'inline-flex items-center gap-1 rounded-full bg-graphite-900 px-2.5 py-0.5 text-xs font-bold text-signal-300'
              : 'cab-chip'
          }
          title={badge === 'Проверен' ? 'Администратор проверил компанию и документы' : undefined}
        >
          {badge === 'Проверен' && (
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden fill="currentColor">
              <path d="M8 1 2.5 3v4.6c0 3.2 2.3 6.1 5.5 7.4 3.2-1.3 5.5-4.2 5.5-7.4V3L8 1Zm-1 9.6L4.6 8.2l1-1L7 8.6l3.4-3.4 1 1L7 10.6Z" />
            </svg>
          )}
          {badge}
        </li>
      ))}
      {value.recommends && (
        <li className="inline-flex items-center rounded-full bg-signal-50 px-2.5 py-0.5 text-xs font-semibold text-signal-800">
          {value.recommends}
        </li>
      )}
    </ul>
  );
}
