'use client';

import { useEffect, useRef, useState } from 'react';

// A cinematic, scroll-scrubbed "one shift" story: the section is several
// screens tall, the scene stays pinned, and scrolling plays it like a video.
// A HUD shows the shift clock, trench depth, excavated soil and the running
// price. The numbers are an illustrative example of an 8-hour shift.

const RATE = 3000; // ₽ per machine-hour, backhoe loader with an operator
const SHIFT_HOURS = 8;

const CHAPTERS = [
  {
    id: 'order',
    label: 'Заявка',
    from: 0,
    text: 'Вы описываете задачу — ИИ-агент подбирает машину.',
  },
  { id: 'arrive', label: 'Подача', from: 0.18, text: 'Машина с машинистом приезжает на объект.' },
  {
    id: 'work',
    label: 'Работа',
    from: 0.4,
    text: 'Копаем траншею. Платите только за часы работы.',
  },
  { id: 'pay', label: 'Расчёт', from: 0.84, text: 'Смена закрыта: цена видна сразу, без доплат.' },
];

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const phase = (p: number, from: number, to: number) => clamp((p - from) / (to - from));
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

export function ShiftStory() {
  const sectionRef = useRef<HTMLElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setProgress(1);
      return;
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      const el = sectionRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const scrollable = rect.height - window.innerHeight;
      setProgress(scrollable > 0 ? clamp(-rect.top / scrollable) : 0);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  const p = progress;
  const drive = ease(phase(p, 0.12, 0.4)); // machine drives in
  const work = phase(p, 0.4, 0.84); // digging
  const settle = phase(p, 0.84, 0.95);

  const hours = work * SHIFT_HOURS;
  const depth = work * 2.4; // metres
  const soil = work * 42; // cubic metres
  const price = Math.floor(hours) * RATE;

  // Digging cycle: boom and stick swing while the trench gets deeper.
  const cycle = Math.sin(work * Math.PI * 14);
  const digging = work > 0 && work < 1 ? 1 : 0;
  const boom = -24 + (6 + depth * 3) * digging * (0.5 + 0.5 * cycle) - 6 * settle;
  const stick = 78 + 18 * digging * cycle + 8 * settle;
  const bucket = 20 + 40 * digging * (0.5 - 0.5 * cycle);

  const tx = -900 + 1230 * drive; // machine x offset
  const trench = depth * 26; // px
  const chapterIndex = CHAPTERS.reduce((index, chapter, i) => (p >= chapter.from ? i : index), 0);
  const chapter = CHAPTERS[chapterIndex]!;
  const clock = `${String(Math.floor(hours)).padStart(2, '0')}:${String(
    Math.floor((hours % 1) * 60),
  ).padStart(2, '0')}`;

  return (
    <section
      ref={sectionRef}
      className="relative ml-[calc(50%-50vw)] h-[420vh] w-screen"
      aria-label="Пример смены"
    >
      <div className="sticky top-0 flex h-[100svh] flex-col overflow-hidden bg-[#07080a] text-white">
        {/* Work light and floor reflection, like a lit set. */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(60% 55% at 62% 30%, rgba(245,158,11,0.28), transparent 70%),' +
              'radial-gradient(90% 40% at 50% 100%, rgba(245,158,11,0.12), transparent 70%)',
          }}
          aria-hidden
        />
        <div className="story-dust pointer-events-none absolute inset-0" aria-hidden />

        {/* Chapter nav */}
        <div className="relative z-10 mx-auto mt-20 flex w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="eyebrow text-amber-400">Пример смены</div>
          <nav className="flex gap-1 rounded-full bg-white/5 p-1 ring-1 ring-white/10">
            {CHAPTERS.map((item, index) => (
              <span
                key={item.id}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition sm:text-sm ${
                  index === chapterIndex ? 'bg-amber-500 text-slate-950' : 'text-slate-400'
                }`}
              >
                {item.label}
              </span>
            ))}
          </nav>
        </div>

        {/* HUD */}
        <dl className="relative z-10 mx-auto mt-6 grid w-full max-w-6xl grid-cols-2 gap-3 sm:grid-cols-4 px-4 font-mono sm:px-6">
          {[
            ['Смена', clock],
            ['Глубина', `${depth.toFixed(1)} м`],
            ['Грунт', `${Math.round(soil)} м³`],
            ['К оплате', `${price.toLocaleString('ru-RU')} ₽`],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-[0.6rem] uppercase tracking-[0.2em] text-slate-500">{label}</dt>
              <dd className="truncate text-sm tabular-nums text-slate-100 sm:text-xl">{value}</dd>
            </div>
          ))}
        </dl>

        {/* Scene */}
        <div className="relative flex flex-1 items-center justify-center">
          <div
            className="absolute left-1/2 top-1/2 z-10 w-[min(88vw,380px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white/5 p-4 ring-1 ring-white/15 backdrop-blur"
            style={{
              opacity: 1 - phase(p, 0.1, 0.2),
              transform: `translate(-50%, calc(-50% - ${phase(p, 0.1, 0.2) * 40}px))`,
            }}
            aria-hidden
          >
            <div className="eyebrow text-[0.6rem] text-slate-400">Заявка · ИИ-агент</div>
            <p className="mt-2 text-sm text-slate-200">
              «Нужна траншея под водопровод, 20 м, завтра, Набережные Челны»
            </p>
            <div className="mt-3 flex items-center justify-between rounded-xl bg-amber-500/10 px-3 py-2 text-sm ring-1 ring-amber-500/30">
              <span>Подобран экскаватор-погрузчик</span>
              <span className="font-mono text-amber-400">{RATE.toLocaleString('ru-RU')} ₽/ч</span>
            </div>
          </div>
          <svg
            viewBox="0 0 1000 480"
            overflow="visible"
            className="h-full max-h-[60vh] w-full min-w-[620px] max-w-5xl max-sm:-translate-x-[10%]"
            aria-hidden
          >
            <defs>
              <linearGradient id="story-ground" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#2a2118" />
                <stop offset="1" stopColor="#07080a" />
              </linearGradient>
              <linearGradient id="story-body" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#fbbf24" />
                <stop offset="1" stopColor="#d97706" />
              </linearGradient>
            </defs>
            <rect x="-2000" y="380" width="5000" height="100" fill="url(#story-ground)" />
            <line x1="-2000" y1="380" x2="3000" y2="380" stroke="#f59e0b" strokeOpacity="0.35" />
            {/* Trench and spoil heap */}
            <path
              d={`M770 380 L786 ${380 + trench} L870 ${380 + trench} L886 380 Z`}
              fill="#0b0c0e"
              stroke="#78350f"
            />
            <ellipse
              cx="975"
              cy="380"
              rx={soil * 1.6}
              ry={soil * 1}
              fill="#3f2a17"
              stroke="#92400e"
              strokeOpacity="0.6"
            />

            <g transform={`translate(${tx} 0)`}>
              {/* Front loader bucket */}
              <path d="M8 330 L-30 330 L-40 372 L6 372 Z" fill="#b45309" />
              <line x1="30" y1="318" x2="4" y2="340" stroke="#92400e" strokeWidth="8" />
              {/* Body and cab */}
              <rect x="20" y="290" width="250" height="62" rx="10" fill="url(#story-body)" />
              <rect x="140" y="200" width="100" height="92" rx="8" fill="#f59e0b" />
              <rect
                x="152"
                y="212"
                width="76"
                height="52"
                rx="5"
                fill="#0f172a"
                stroke="#fde68a"
                strokeOpacity="0.4"
              />
              <circle cx="238" cy="206" r="5" fill="#fde68a" className="story-beacon" />
              {/* Wheels */}
              {[
                [70, 352, 30],
                [225, 348, 36],
              ].map(([cx, cy, r]) => (
                <g key={cx} transform={`rotate(${drive * 720} ${cx} ${cy})`}>
                  <circle cx={cx} cy={cy} r={r} fill="#111" stroke="#27272a" strokeWidth="6" />
                  <line
                    x1={cx! - r!}
                    y1={cy}
                    x2={cx! + r!}
                    y2={cy}
                    stroke="#3f3f46"
                    strokeWidth="4"
                  />
                </g>
              ))}
              {/* Backhoe: boom → stick → bucket */}
              <g transform={`translate(270 305) rotate(${boom})`}>
                <rect x="0" y="-9" width="150" height="18" rx="8" fill="#f59e0b" />
                <g transform={`translate(150 0) rotate(${stick})`}>
                  <rect x="0" y="-7" width="140" height="14" rx="6" fill="#fbbf24" />
                  <g transform={`translate(140 0) rotate(${bucket})`}>
                    <path d="M0 -12 L34 -8 L30 22 L4 18 Z" fill="#b45309" />
                  </g>
                </g>
              </g>
            </g>
          </svg>
        </div>

        {/* Caption, CTA and scrubber */}
        <div className="relative z-10 mx-auto mb-8 w-full max-w-6xl px-4 sm:px-6">
          <p className="max-w-xl text-lg font-semibold sm:text-2xl">{chapter.text}</p>
          <div className="mt-3 h-12 transition-opacity duration-500" style={{ opacity: settle }}>
            <span className="text-sm text-slate-400">
              {SHIFT_HOURS} ч × {RATE.toLocaleString('ru-RU')} ₽ ={' '}
              {(SHIFT_HOURS * RATE).toLocaleString('ru-RU')} ₽ ·{' '}
            </span>
            <a href="#callback" className="text-sm font-semibold text-amber-400 hover:underline">
              Заказать такую смену →
            </a>
          </div>
          <div className="mt-2 flex items-center gap-3 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-slate-500">
            <span>{chapter.label}</span>
            <div className="h-px flex-1 bg-white/10">
              <div className="h-px bg-amber-400" style={{ width: `${p * 100}%` }} />
            </div>
            <span>{Math.round(p * 100)}%</span>
          </div>
        </div>
      </div>
    </section>
  );
}
