'use client';

import { useEffect, useState } from 'react';
import { CallbackForm } from '@/components/CallbackForm';
import { Icon, type IconName } from '@/components/Icon';
import { MachinePhoto } from '@/components/MachinePhoto';
import type { MachineType } from '@/lib/machinePhotos';
import { WorkOrderPreview } from '@/components/WorkOrderPreview';
import { WeatherHud } from '@/components/WeatherHud';
import {
  machineGroup,
  mskToday,
  weatherLine,
  type ShiftWeather,
  type WorkNote,
} from '@/lib/weather';

// «Подобрать технику»: three quick questions → a recommended machine, a rough
// price range from the price list and a callback form with the answers filled in.

const TASKS: {
  id: string;
  icon: IconName;
  label: string;
  machine: string;
  rate?: number;
  landing?: string;
  photo?: MachineType;
}[] = [
  {
    id: 'dig',
    icon: 'excavator',
    label: 'Траншея, котлован, планировка',
    machine: 'Экскаватор-погрузчик',
    rate: 3000,
    landing: 'ekskavator-pogruzchik',
    photo: 'backhoe',
  },
  {
    id: 'break',
    icon: 'hammer',
    label: 'Демонтаж, асфальт, бетон',
    machine: 'Экскаватор-погрузчик с гидромолотом',
    rate: 3500,
    landing: 'ekskavator-pogruzchik',
    photo: 'backhoe',
  },
  {
    id: 'lift',
    icon: 'crane',
    label: 'Поднять, смонтировать груз',
    machine: 'Автокран',
    rate: 3500,
    landing: 'avtokran',
    photo: 'crane',
  },
  {
    id: 'kmu',
    icon: 'crane',
    label: 'Подъём и перевозка груза манипулятором',
    machine: 'Манипулятор КМУ 7 т',
    landing: 'manipulyator-kmu',
    photo: 'kmu',
  },
  {
    id: 'height',
    icon: 'lift',
    label: 'Работы на высоте',
    machine: 'Автовышка АГП',
    landing: 'avtovyshka-agp',
    photo: 'agp',
  },
  {
    id: 'load',
    icon: 'loader',
    label: 'Погрузка сыпучих, уборка снега',
    machine: 'Фронтальный погрузчик',
    rate: 3000,
    landing: 'frontalnyj-pogruzchik',
    photo: 'loader',
  },
  {
    id: 'compact',
    icon: 'roller',
    label: 'Уплотнение грунта и асфальта',
    machine: 'Виброкаток',
    landing: 'vibrokatok',
    photo: 'roller',
  },
  {
    id: 'utility',
    icon: 'tractor',
    label: 'Коммунальные и вспомогательные работы',
    machine: 'Трактор МТЗ',
    rate: 2500,
    landing: 'traktor',
    photo: 'tractor',
  },
  { id: 'other', icon: 'helmet', label: 'Другое — опишу сам', machine: 'Подберёт менеджер' },
];

const WHEN = ['Сегодня', 'Завтра', 'На этой неделе', 'Позже'];

const VOLUME: { label: string; hours?: [number, number] }[] = [
  { label: 'Несколько часов', hours: [4, 6] },
  { label: 'Одна смена (8 ч)', hours: [8, 8] },
  { label: '2–3 смены', hours: [16, 24] },
  { label: 'Не знаю' },
];

const rub = (value: number) => `${value.toLocaleString('ru-RU')} ₽`;

export function TaskWizard() {
  const [step, setStep] = useState(0);
  const [task, setTask] = useState<(typeof TASKS)[number] | null>(null);
  const [when, setWhen] = useState('');
  const [volume, setVolume] = useState<(typeof VOLUME)[number] | null>(null);
  // Forecast for «Сегодня»/«Завтра» at the result step; the booking form waits
  // for it (a second at most) so the weather goes into the request text.
  const [forecast, setForecast] = useState<{
    date: string;
    weather: ShiftWeather | null;
    notes: WorkNote[];
  } | null>(null);
  const [forecastDone, setForecastDone] = useState(true);

  const workDate =
    when === 'Сегодня' ? mskToday() : when === 'Завтра' ? mskToday(Date.now() + 86_400_000) : null;

  useEffect(() => {
    if (step !== 3 || !task || !workDate) {
      setForecast(null);
      setForecastDone(true);
      return;
    }
    const controller = new AbortController();
    setForecastDone(false);
    const params = new URLSearchParams({ date: workDate });
    if (task.photo) params.set('kind', task.photo);
    fetch(`/api/weather?${params}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        setForecast(
          data?.weather ? { date: workDate, weather: data.weather, notes: data.notes } : null,
        );
        setForecastDone(true);
      })
      .catch((error: Error) => {
        if (error.name !== 'AbortError') setForecastDone(true);
      });
    // Never keep the form waiting for long.
    const timer = window.setTimeout(() => setForecastDone(true), 2500);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [step, task, workDate]);

  const estimate =
    task?.rate && volume?.hours
      ? volume.hours[0] === volume.hours[1]
        ? rub(task.rate * volume.hours[0])
        : `${rub(task.rate * volume.hours[0])} – ${rub(task.rate * volume.hours[1])}`
      : null;

  const summary = task
    ? `Подбор техники: ${task.label}. Когда: ${when || '—'}. Объём: ${volume?.label ?? '—'}. ` +
      `Рекомендация: ${task.machine}${estimate ? `, ориентир ${estimate}` : ''}.` +
      (forecast?.weather
        ? ` Погода на смену: ${weatherLine(forecast.weather, forecast.notes)}.`
        : '')
    : '';

  const choice = (active: boolean) =>
    `flex items-center gap-3 rounded-2xl border p-4 text-left text-sm font-semibold transition ${
      active
        ? 'border-amber-500 bg-amber-50 text-slate-900'
        : 'border-slate-200 bg-white hover:-translate-y-0.5 hover:border-slate-400'
    }`;

  return (
    <section
      id="podbor"
      className="scroll-mt-24 overflow-hidden rounded-[2rem] border border-slate-200 bg-white"
    >
      <div className="grid lg:grid-cols-12">
        <div className="bg-slate-950 p-6 text-white sm:p-10 lg:col-span-4">
          <div className="eyebrow text-amber-400">Подбор за 30 секунд</div>
          <h2 className="mt-3 text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">
            Подобрать технику под задачу
          </h2>
          <p className="mt-4 text-slate-400">
            Три вопроса — и вы увидите подходящую машину и ориентир по цене из нашего прайса.
          </p>
          <ol className="mt-8 hidden flex-col gap-3 font-mono text-sm sm:flex">
            {['Задача', 'Когда', 'Объём', 'Результат'].map((label, index) => (
              <li
                key={label}
                className={`flex items-center gap-3 ${index <= step ? 'text-white' : 'text-slate-600'}`}
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs ${
                    index < step
                      ? 'bg-amber-500 text-slate-950'
                      : index === step
                        ? 'ring-1 ring-amber-500'
                        : 'ring-1 ring-slate-700'
                  }`}
                >
                  {index < step ? '✓' : index + 1}
                </span>
                {label}
              </li>
            ))}
          </ol>
        </div>

        <div className="p-6 sm:p-10 lg:col-span-8">
          {step === 0 && (
            <div>
              <h3 className="text-xl font-bold">Что нужно сделать?</h3>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {TASKS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`${choice(task?.id === item.id)} ${
                      item.id === 'other' ? 'sm:col-span-2' : ''
                    }`}
                    onClick={() => {
                      setTask(item);
                      setStep(1);
                    }}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-amber-400">
                      <Icon name={item.icon} className="h-6 w-6" />
                    </span>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <h3 className="text-xl font-bold">Когда нужна техника?</h3>
              <div className="mt-5 grid grid-cols-2 gap-3">
                {WHEN.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={choice(when === item)}
                    onClick={() => {
                      setWhen(item);
                      setStep(2);
                    }}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h3 className="text-xl font-bold">Сколько примерно работы?</h3>
              <div className="mt-5 grid grid-cols-2 gap-3">
                {VOLUME.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className={choice(volume?.label === item.label)}
                    onClick={() => {
                      setVolume(item);
                      setStep(3);
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && task && (
            <div className="grid gap-6 xl:grid-cols-2">
              <div>
                {task.photo && (
                  <div className="wizard-photo relative mb-5 aspect-[16/9] overflow-hidden rounded-2xl bg-slate-950">
                    <MachinePhoto
                      key={task.photo}
                      type={task.photo}
                      slot="wizard"
                      alt={task.machine}
                      sizes="(min-width: 1280px) 360px, (min-width: 1024px) 560px, 100vw"
                    />
                    <span className="absolute bottom-2 right-3 text-[0.6rem] text-white/70">
                      Фото для примера
                    </span>
                  </div>
                )}
                <div className="eyebrow text-amber-700">Рекомендуем</div>
                <h3 className="mt-2 text-2xl font-extrabold tracking-tight">{task.machine}</h3>
                <dl className="mt-4 divide-y divide-slate-200 rounded-2xl border border-slate-200 text-sm">
                  {[
                    ['Задача', task.label],
                    ['Когда', when],
                    ['Объём', volume?.label ?? '—'],
                    ['Ставка', task.rate ? `от ${rub(task.rate)}/ч с машинистом` : 'по запросу'],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-4 px-4 py-2.5">
                      <dt className="text-slate-500">{label}</dt>
                      <dd className="text-right font-medium">{value}</dd>
                    </div>
                  ))}
                </dl>
                {estimate && (
                  <div className="mt-4 rounded-2xl bg-slate-950 p-4 text-white">
                    <div className="eyebrow text-[0.65rem] text-slate-400">
                      Ориентир, без доставки
                    </div>
                    <div className="mt-1 font-mono text-2xl font-bold text-amber-400">
                      {estimate}
                    </div>
                  </div>
                )}
                <div className="mt-4 flex flex-wrap gap-4 text-sm">
                  {task.landing && (
                    <a
                      href={`/arenda/${task.landing}`}
                      className="font-semibold text-amber-700 hover:underline"
                    >
                      Подробнее о технике →
                    </a>
                  )}
                  <button
                    type="button"
                    className="text-slate-500 hover:text-slate-900"
                    onClick={() => setStep(0)}
                  >
                    ← Начать заново
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-4">
                <WorkOrderPreview
                  machine={task.machine}
                  when={when}
                  task={volume ? `${task.label} · ${volume.label}` : task.label}
                  weather={forecast?.weather ? weatherLine(forecast.weather, forecast.notes) : null}
                  price={estimate ?? 'по запросу'}
                />
                {forecastDone ? (
                  <CallbackForm
                    key={summary}
                    source="wizard"
                    defaultMessage={summary}
                    title="Забронировать"
                    subtitle="Менеджер уточнит адрес и подачу и назовёт точную цену."
                  />
                ) : (
                  <div
                    className="h-72 animate-pulse rounded-2xl bg-slate-100"
                    aria-label="Проверяем погоду"
                  />
                )}
              </div>
              {forecast?.weather && (
                <div className="xl:col-span-2">
                  <WeatherHud
                    weather={forecast.weather}
                    notes={forecast.notes}
                    place="Набережные Челны"
                    dateLabel={when.toLowerCase()}
                    machineLabel={`для: ${task.machine.toLowerCase()}`}
                    group={machineGroup(task.photo)}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
