import { Icon, type IconName } from '@/components/Icon';

// Shown on pages that list every provider's machines: claims that only the
// house fleet can back are said about СпецПласт16 by name.
const BADGES: { icon: IconName; title: string; text: string }[] = [
  { icon: 'helmet', title: 'С машинистом', text: 'Машина приезжает с машинистом' },
  { icon: 'receipt', title: 'НДС у СпецПласт16', text: 'Безнал для юрлиц; у других — уточняйте' },
  { icon: 'document', title: 'Договор с исполнителем', text: 'Закрывающие документы — от него' },
  { icon: 'clock', title: 'Почасовая оплата', text: 'Платите за отработанные часы' },
];

export function TrustBadges({ dark = false }: { dark?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {BADGES.map((badge) => (
        <div
          key={badge.title}
          className={`flex items-start gap-3 rounded-2xl p-4 ${
            dark ? 'bg-white/5 ring-1 ring-white/10' : 'border border-slate-200 bg-white'
          }`}
        >
          <span className={`mt-0.5 shrink-0 ${dark ? 'text-amber-400' : 'text-amber-700'}`}>
            <Icon name={badge.icon} className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <div className={`text-sm font-semibold ${dark ? 'text-white' : ''}`}>{badge.title}</div>
            <div className={`text-xs ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
              {badge.text}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
