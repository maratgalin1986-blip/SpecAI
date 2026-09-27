const BADGES = [
  { icon: '👷', title: 'С машинистом', text: 'Опытные операторы на каждой машине' },
  { icon: '🧾', title: 'Работаем с НДС', text: 'Оплата по безналу для юрлиц' },
  { icon: '📑', title: 'Договор и ЭДО', text: 'Закрывающие документы в срок' },
  { icon: '⏱️', title: 'Почасовая оплата', text: 'Платите за отработанные часы' },
];

export function TrustBadges({ dark = false }: { dark?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {BADGES.map((badge) => (
        <div
          key={badge.title}
          className={`flex items-start gap-3 rounded-xl p-3 ${
            dark ? 'bg-white/5 ring-1 ring-white/10' : 'border border-slate-200 bg-white'
          }`}
        >
          <span className="text-2xl" aria-hidden>
            {badge.icon}
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
