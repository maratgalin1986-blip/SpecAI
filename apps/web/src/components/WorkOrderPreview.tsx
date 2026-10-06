// «Бланк наряда»: a document-style card that fills in as the customer answers
// the wizard. Purely presentational; values arrive as props.

type Props = {
  machine?: string | null;
  when?: string | null;
  task?: string | null;
  weather?: string | null;
  price?: string | null;
  phone?: string | null;
  className?: string;
};

export function maskPhone(raw: string) {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  return `+7 (${digits.slice(-10, -7) || '•••'}) •••-••-${digits.slice(-2)}`;
}

export function WorkOrderPreview({ machine, when, task, weather, price, phone, className }: Props) {
  const phoneMasked = phone ? maskPhone(phone) : '';
  const rows: { label: string; value: string; counted: boolean }[] = [
    { label: 'Техника', value: machine ?? '', counted: true },
    { label: 'Когда', value: when ?? '', counted: true },
    { label: 'Объём / задача', value: task ?? '', counted: true },
    { label: 'Погода', value: weather ?? '', counted: Boolean(weather) },
    { label: 'Ориентировочно', value: price ?? '', counted: true },
    { label: 'Телефон', value: phoneMasked, counted: phone !== undefined && phone !== null },
  ];
  const counted = rows.filter((row) => row.counted);
  const filled = counted.filter((row) => row.value).length;
  const percent = counted.length ? Math.round((filled / counted.length) * 100) : 0;
  const ready = counted.length > 0 && filled === counted.length;

  return (
    <div
      aria-hidden="true"
      className={`work-order hud-corners relative rounded-2xl border border-slate-700 bg-slate-900 p-4 text-slate-200 sm:p-5 ${className ?? ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[0.65rem] font-bold uppercase tracking-[0.2em] text-amber-400">
            Заявка на смену · СпецПласт16
          </div>
          <div className="mt-1 font-mono text-[0.6rem] text-slate-500">
            {ready ? 'Все поля заполнены' : 'Заполняется по вашим ответам'}
          </div>
        </div>
        {ready && <span className="stamp text-xs">Готов</span>}
      </div>
      <dl className="mt-3 divide-y divide-dashed divide-slate-700 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-4 py-1.5">
            <dt className="shrink-0 font-mono text-[0.65rem] uppercase tracking-wider text-slate-500">
              {row.label}
            </dt>
            <dd className="min-w-0 text-right font-medium text-slate-100">
              {row.value ? (
                <span key={row.value} className="work-order-value">
                  {row.value}
                </span>
              ) : (
                <span className="text-slate-600">· · · · · · ·</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-amber-500 transition-[width] duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>
        <span className="font-mono text-[0.65rem] text-amber-400">{percent}%</span>
      </div>
    </div>
  );
}
