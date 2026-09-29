import { WeatherIcon, WindArrow } from '@/components/WeatherIcon';
import {
  LEVEL_LABEL,
  mskParts,
  tempRange,
  weatherLine,
  SHIFT_END,
  SHIFT_START,
  symbolLabel,
  windFrom,
  worstLevel,
  type ShiftWeather,
  type WorkLevel,
  type WorkNote,
} from '@/lib/weather';

// «Метеосводка с площадки»: the forecast for a work shift styled as a camera
// monitor, with the verdict for the machine. Presentational only — usable
// from server and client components.

const LEVEL_STYLE: Record<WorkLevel, { badge: string; dot: string; text: string }> = {
  ok: {
    badge: 'bg-emerald-500/15 ring-emerald-400/40',
    dot: 'bg-emerald-400',
    text: 'text-emerald-300',
  },
  caution: {
    badge: 'bg-amber-500/15 ring-amber-400/40',
    dot: 'bg-amber-400',
    text: 'text-amber-300',
  },
  stop: { badge: 'bg-red-500/15 ring-red-400/50', dot: 'bg-red-500', text: 'text-red-300' },
};

const signed = (value: number) => `${value > 0 ? '+' : ''}${Math.round(value)}`;

export function WeatherHud({
  weather,
  notes,
  place,
  dateLabel,
  machineLabel,
  emptyReason = 'far',
}: {
  weather: ShiftWeather | null;
  /** Why there is no forecast: the date is too far ahead, or the service is down. */
  emptyReason?: 'far' | 'unavailable';
  notes: WorkNote[];
  place: string;
  dateLabel: string;
  /** «для автокрана» — whose limits the verdict uses. */
  machineLabel?: string;
}) {
  if (!weather) {
    return (
      <section className="weather-hud relative overflow-hidden rounded-3xl bg-slate-950 p-6 text-white ring-1 ring-white/10">
        <div
          className="journey-scanlines pointer-events-none absolute inset-0 opacity-40"
          aria-hidden
        />
        <div className="relative font-mono text-[0.65rem] uppercase tracking-[0.2em] text-white/60">
          Метеосводка · {place}
        </div>
        <p className="relative mt-3 text-white/80">
          {emptyReason === 'unavailable'
            ? `Прогноз на ${dateLabel} сейчас не загрузился — обновите страницу чуть позже.`
            : `Прогноз на ${dateLabel} появится за 9 дней до даты работ.`}
        </p>
      </section>
    );
  }

  const level = worstLevel(notes);
  const style = LEVEL_STYLE[level];
  const hours = weather.hourly ? weather.points : [];
  const windPeak = Math.max(10, ...hours.map((p) => p.wind));

  return (
    <section
      className="weather-hud relative overflow-hidden rounded-3xl bg-slate-950 text-white ring-1 ring-white/10"
      aria-label={`Погода на ${dateLabel}: ${weatherLine(weather, notes)}`}
    >
      <div
        className={`weather-sky weather-sky-${level} pointer-events-none absolute inset-0`}
        aria-hidden
      />
      <div
        className="journey-scanlines pointer-events-none absolute inset-0 opacity-40"
        aria-hidden
      />
      <div className="hud-corners pointer-events-none absolute inset-3" aria-hidden />

      <div className="relative flex flex-wrap items-center justify-between gap-2 px-5 pt-5 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-white/70 sm:px-7">
        <span className="flex items-center gap-2">
          <span className="journey-rec h-1.5 w-1.5 rounded-full bg-red-500" />
          Метеосводка · {place}
        </span>
        <span>
          {dateLabel} · смена {String(SHIFT_START).padStart(2, '0')}:00–{SHIFT_END}:00
        </span>
      </div>

      <div className="relative flex flex-col gap-5 px-5 pb-5 pt-4 sm:px-7">
        <div className="flex items-center gap-4">
          <WeatherIcon symbol={weather.symbol} className="h-16 w-16 text-amber-300" />
          <div>
            <div className="text-5xl font-extrabold tracking-tight tabular-nums">
              {tempRange(weather)}
            </div>
            <div className="mt-1 text-sm text-white/70">
              {symbolLabel(weather.symbol)} · ощущается {signed(weather.feelsMin)}°
            </div>
          </div>
        </div>

        <dl className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-white/50">
              Ветер
            </dt>
            <dd className="mt-1 flex items-center gap-1.5 font-semibold tabular-nums">
              <WindArrow degrees={weather.windDir} className="h-4 w-4 text-amber-300" />
              до {Math.round(weather.windMax)} м/с {windFrom(weather.windDir)}
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-white/50">
              Осадки
            </dt>
            <dd className="mt-1 font-semibold tabular-nums">
              {weather.precip ? `${weather.precip} мм` : 'нет'}
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-white/50">
              Видимость
            </dt>
            <dd className="mt-1 font-semibold">{weather.fogMax >= 50 ? 'туман' : 'хорошая'}</dd>
          </div>
        </dl>
      </div>

      {hours.length > 0 && (
        <ol className="relative mx-5 mb-5 grid grid-flow-col gap-1 overflow-x-auto rounded-2xl bg-white/5 p-3 ring-1 ring-white/10 sm:mx-7">
          {hours.map((point) => {
            const hour = mskParts(point.time).hour;
            return (
              <li
                key={point.time}
                className="flex min-w-[2.6rem] flex-col items-center gap-1 text-center"
              >
                <span className="font-mono text-[0.6rem] text-white/50">
                  {String(hour).padStart(2, '0')}:00
                </span>
                <WeatherIcon symbol={point.symbol} className="h-5 w-5 text-white/80" />
                <span className="text-xs font-semibold tabular-nums">{signed(point.temp)}°</span>
                {/* Wind bar; the line marks 10 m/s, the lifting limit. */}
                <span
                  className="relative flex h-8 w-1.5 items-end rounded-full bg-white/10"
                  aria-hidden
                >
                  <span
                    className={`w-full rounded-full ${point.wind >= 10 ? 'bg-red-500' : point.wind >= 7 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                    style={{ height: `${Math.min(100, (point.wind / windPeak) * 100)}%` }}
                  />
                </span>
                <span className="font-mono text-[0.6rem] tabular-nums text-white/60">
                  {Math.round(point.wind)}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <div className={`relative mx-5 mb-5 rounded-2xl p-4 ring-1 sm:mx-7 ${style.badge}`}>
        <div className={`flex items-center gap-2 font-semibold ${style.text}`}>
          <span className={`h-2 w-2 rounded-full ${style.dot}`} aria-hidden />
          {LEVEL_LABEL[level]}
          {machineLabel ? <span className="font-normal text-white/60">{machineLabel}</span> : null}
        </div>
        <ul className="mt-2 flex flex-col gap-1.5 text-sm text-white/80">
          {notes.map((note) => (
            <li key={note.title}>
              <span className="font-semibold text-white">{note.title}.</span> {note.advice}
            </li>
          ))}
        </ul>
      </div>

      <p className="relative px-5 pb-4 text-[0.65rem] text-white/40 sm:px-7">
        Прогноз: MET Norway (CC BY 4.0), обновляется каждые 30 минут.{' '}
        {weather.hourly ? 'Почасовой.' : 'По 6-часовым интервалам — уточнится ближе к дате.'}
      </p>
    </section>
  );
}
