'use client';

import { useEffect, useRef, useState } from 'react';
import type { ShiftStoryScene } from '@/lib/shiftStoryScene';

// A cinematic, scroll-scrubbed "one shift" story: the section is several
// screens tall, the scene stays pinned, and scrolling plays it like a video.
// A HUD shows the shift clock, trench depth, excavated soil and the running
// price. The numbers are an illustrative example of an 8-hour shift. The
// machine itself is a three.js scene, loaded lazily and drawn only while the
// section is on screen.

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

export function ShiftStory() {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ShiftStoryScene>();
  const [progress, setProgress] = useState(0);
  const [sceneReady, setSceneReady] = useState(false);
  const progressRef = useRef(0);

  useEffect(() => {
    const section = sectionRef.current;
    const container = canvasRef.current;
    if (!section || !container) return;
    let cancelled = false;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const visibility = new IntersectionObserver(([entry]) => {
      sceneRef.current?.setRunning(entry?.isIntersecting ?? false);
    });
    // Load three.js only when the story is about to scroll into view.
    const approach = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        approach.disconnect();
        import('@/lib/shiftStoryScene')
          .then(({ createShiftStoryScene }) => {
            if (cancelled) return;
            try {
              sceneRef.current = createShiftStoryScene(container, { reducedMotion });
            } catch {
              return; // No WebGL — the lit backdrop and HUD still tell the story.
            }
            sceneRef.current.setProgress(progressRef.current);
            visibility.observe(section);
            setSceneReady(true);
          })
          .catch(() => undefined);
      },
      { rootMargin: '100% 0px' },
    );
    approach.observe(section);
    return () => {
      cancelled = true;
      approach.disconnect();
      visibility.disconnect();
      sceneRef.current?.dispose();
      sceneRef.current = undefined;
    };
  }, []);

  useEffect(() => {
    progressRef.current = progress;
    sceneRef.current?.setProgress(progress);
  }, [progress]);

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
          <div
            ref={canvasRef}
            className={`absolute inset-0 transition-opacity duration-700 [mask-image:linear-gradient(to_bottom,transparent,black_18%,black_78%,transparent)] ${
              sceneReady ? 'opacity-100' : 'opacity-0'
            }`}
            aria-hidden
          />
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
