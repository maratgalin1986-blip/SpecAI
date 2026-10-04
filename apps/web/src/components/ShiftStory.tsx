'use client';

import { useEffect, useRef, useState } from 'react';
import { MachinePhoto } from '@/components/MachinePhoto';
import { RATES } from '@/lib/prices';

// A cinematic, scroll-scrubbed "one shift" story: the section is several
// screens tall, the scene stays pinned, and scrolling plays it like a video.
// A HUD shows the shift clock, trench depth, excavated soil and the running
// price. The numbers are an illustrative example of an 8-hour shift. The
// scene is a pair of photos that cross-fade and slowly push in as you scroll.
// On the way in the scene is a "portal": a small rounded window in the middle
// of the screen that widens to full screen as the section scrolls up, so the
// visitor dives into the scene before the story starts.

const RATE = RATES.backhoe; // ₽ per machine-hour, backhoe loader with an operator (lib/prices.ts)
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

export function ShiftStory() {
  const sectionRef = useRef<HTMLElement>(null);
  const [progress, setProgress] = useState(0);
  const [enter, setEnter] = useState(0);
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setProgress(1);
      setEnter(1);
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
      // Portal: opens while the section rises into view and finishes over
      // the first tenth of the pinned story.
      const rising = clamp(1 - rect.top / window.innerHeight);
      const pinned = scrollable > 0 ? clamp(-rect.top / (scrollable * 0.1)) : 1;
      setEnter(0.55 * rising + 0.45 * pinned);
      setNarrow(window.innerWidth < 640);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    // Off screen the looping dust pauses (globals.css, [data-offscreen]).
    const section = sectionRef.current;
    const observer =
      section && typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(([entry]) =>
            section.toggleAttribute('data-offscreen', !entry?.isIntersecting),
          )
        : null;
    if (section) observer?.observe(section);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, []);

  const p = progress;
  // Portal: smoothstep, so the window starts small and settles softly.
  const open = enter * enter * (3 - 2 * enter);
  const closed = 1 - open;
  const insetY = 28 * closed;
  const insetX = (narrow ? 8 : 34) * closed;
  const portal =
    closed > 0.001
      ? `inset(${insetY}% ${insetX}% ${insetY}% ${insetX}% round ${Math.round(48 * closed)}px)`
      : 'none';
  const arrive = phase(p, 0.12, 0.35); // machine photo comes into light
  const dig = phase(p, 0.36, 0.46); // cross-fade to the trench
  const work = phase(p, 0.4, 0.84); // digging
  const settle = phase(p, 0.84, 0.95);

  const hours = work * SHIFT_HOURS;
  const depth = work * 2.4; // metres
  const soil = work * 42; // cubic metres
  const price = Math.floor(hours) * RATE;

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
      <div
        className="sticky top-0 flex h-[100svh] flex-col overflow-hidden bg-[#07080a] text-white"
        style={{ clipPath: portal, WebkitClipPath: portal }}
      >
        {/* Photo scene: the machine arrives, then the trench deepens under
            the work lights. Both frames push in slowly as the story plays. */}
        <div className="absolute inset-0" aria-hidden>
          <MachinePhoto
            type="backhoe"
            slot="story"
            style={{
              opacity: Math.max(0.35 + 0.65 * arrive, 0.85 * closed) * (1 - dig),
              transform: `scale(${1.02 + 0.06 * p + 0.35 * closed})`,
            }}
          />
          <MachinePhoto
            type="trench"
            slot="story"
            style={{ opacity: dig, transform: `scale(${1.02 + 0.1 * work})` }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#07080a] via-[#07080a]/30 to-[#07080a]" />
          <div
            className="absolute inset-0 bg-[#07080a]"
            style={{ opacity: 0.55 * (1 - arrive) * open + 0.35 * settle }}
          />
        </div>
        <div className="story-dust pointer-events-none absolute inset-0" aria-hidden />
        {/* Glowing rim of the portal window; fades once it is full screen. */}
        <div
          className="pointer-events-none absolute inset-0 z-20 ring-2 ring-inset ring-amber-400/70 shadow-[inset_0_0_60px_rgba(245,158,11,0.35)]"
          style={{
            // Scaled, not resized: a transform does not count as a layout shift.
            transform: `scale(${1 - (2 * insetX) / 100}, ${1 - (2 * insetY) / 100})`,
            borderRadius: 48 * closed,
            opacity: closed > 0.001 ? Math.min(1, closed * 3) : 0,
          }}
          aria-hidden
        />

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
              <dt className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</dt>
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
        </div>

        {/* Caption, CTA and scrubber */}
        <div className="relative z-10 mx-auto mb-8 w-full max-w-6xl px-4 sm:px-6">
          <p className="max-w-xl text-lg font-semibold sm:text-2xl">{chapter.text}</p>
          <div className="mt-3 h-12 transition-opacity duration-500" style={{ opacity: settle }}>
            <span className="text-sm text-slate-400">
              {SHIFT_HOURS} ч × {RATE.toLocaleString('ru-RU')} ₽ ={' '}
              {(SHIFT_HOURS * RATE).toLocaleString('ru-RU')} ₽ ·{' '}
            </span>
            <a
              href="#callback"
              className="inline-flex min-h-[44px] items-center text-sm font-semibold text-amber-400 hover:underline"
            >
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
