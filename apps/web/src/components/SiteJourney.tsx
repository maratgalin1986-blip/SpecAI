'use client';

import { useEffect, useRef, useState } from 'react';
import { defaultPhotoOf, pickPhoto, type MachineType } from '@/lib/machinePhotos';

// «Путешествие по объекту»: a pinned, scroll-driven fly-through of one big
// construction site. Each stop is a photo; scrolling pulls the camera out of
// the previous shot, holds, then dives into a focal point (a load on the hook,
// the pit, the platform…) and comes out of the next shot — like an Apple-style
// scroll film. Every stop is also a section of the site with a link.

type Scene = {
  type: MachineType;
  place: string;
  title: string;
  text: string;
  href: string;
  cta: string;
};

const SCENES: Scene[] = [
  {
    type: 'crane',
    place: 'Ворота объекта',
    title: 'Большая стройка начинается с техники',
    text: 'Автокраны, экскаваторы, манипуляторы и катки — весь парк в одном каталоге.',
    href: '/equipment',
    cta: 'Открыть каталог',
  },
  {
    type: 'excavator',
    place: 'Котлован',
    title: 'Копаем котлован под фундамент',
    text: 'Гусеничные экскаваторы и экскаваторы-погрузчики с опытными машинистами.',
    href: '/arenda/ekskavator-pogruzchik',
    cta: 'Экскаваторы',
  },
  {
    type: 'kmu',
    place: 'Склад материалов',
    title: 'Привезём и выгрузим',
    text: 'Манипулятор КМУ 7 т и самосвалы — от плит до контейнеров.',
    href: '/#podbor',
    cta: 'Подобрать технику',
  },
  {
    type: 'agp',
    place: 'Фасад',
    title: 'Работы на высоте',
    text: 'Автовышки АГП для фасадов, кровли и освещения.',
    href: '/equipment',
    cta: 'Автовышки',
  },
  {
    type: 'roller',
    place: 'Дорога',
    title: 'Уплотняем и сдаём объект',
    text: 'Виброкатки и погрузчики доводят площадку до финиша.',
    href: '/equipment',
    cta: 'Катки и погрузчики',
  },
  {
    type: 'trench',
    place: 'Ваш объект',
    title: 'Следующая остановка — ваша стройка',
    text: 'Оставьте заявку — подберём технику и назовём цену за 15 минут.',
    href: '/#callback',
    cta: 'Оставить заявку',
  },
];

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (t: number) => t * t * (3 - 2 * t);

export function SiteJourney() {
  const sectionRef = useRef<HTMLElement>(null);
  const [progress, setProgress] = useState(0);
  const [reduced, setReduced] = useState(false);
  // A different photo (machine model and backdrop) of every stop on each visit.
  const [scenes, setScenes] = useState(SCENES);
  const [photos, setPhotos] = useState(() => SCENES.map((scene) => defaultPhotoOf(scene.type)));
  const [clock, setClock] = useState('');

  useEffect(() => {
    // The route between the gate and the finale is shuffled on every visit.
    const middle = SCENES.slice(1, -1).sort(() => Math.random() - 0.5);
    const route = [SCENES[0]!, ...middle, SCENES[SCENES.length - 1]!];
    setScenes(route);
    setPhotos(route.map((scene) => pickPhoto(scene.type, 'journey')));
    const tick = () =>
      setClock(new Date().toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow' }));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setReduced(true);
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

  // Reduced motion: a plain list of the stops.
  if (reduced) {
    return (
      <section aria-label="Путешествие по объекту" className="grid gap-4 sm:grid-cols-2">
        {scenes.map((scene) => (
          <a
            key={scene.type}
            href={scene.href}
            className="overflow-hidden rounded-3xl border border-slate-200 bg-white"
          >
            <img
              src={photos[scenes.indexOf(scene)]}
              alt=""
              className="aspect-video w-full object-cover"
            />
            <div className="p-5">
              <div className="eyebrow text-amber-600">{scene.place}</div>
              <h3 className="mt-2 text-xl font-bold">{scene.title}</h3>
            </div>
          </a>
        ))}
      </section>
    );
  }

  const n = scenes.length;
  const pos = progress * n; // 0…n
  const index = Math.min(n - 1, Math.floor(pos));
  const local = pos - index; // 0…1 inside the current stop

  return (
    <section
      ref={sectionRef}
      aria-label="Путешествие по объекту"
      className="relative ml-[calc(50%-50vw)] w-screen"
      style={{ height: `${n * 110 + 100}vh` }}
    >
      <div className="sticky top-0 h-[100svh] overflow-hidden bg-black text-white">
        {scenes.map((scene, i) => {
          // Arrive: the previous stop's dive lands us deep inside this shot.
          const arrive = i === 0 ? 1 : smooth(clamp((pos - i + 0.16) / 0.4));
          // Leave: dive into the focal point during the last third.
          const leave = i === n - 1 ? 0 : smooth(clamp((pos - i - 0.6) / 0.4));
          const visible = pos > i - 0.2 && pos < i + 1.02;
          if (!visible) return null;
          const scale = (1 + (1 - arrive) * 1.8) * (1 + leave * 3);
          const opacity = i === 0 ? 1 : Math.min(1, arrive * 1.4);
          const blur = (1 - arrive) * 4 + leave * 5;
          return (
            <div
              key={scene.type}
              className="absolute inset-0 will-change-transform"
              style={{
                opacity,
                transform: `scale(${scale})`,
                transformOrigin: '50% 55%',
                filter: blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : undefined,
                zIndex: i,
              }}
            >
              {/* "Live" layer: a handheld camera drift, a slow push-in, cloud
                  shadows and light flicker over the frame. */}
              <div className="journey-handheld absolute inset-0">
                <img
                  src={photos[i]}
                  alt=""
                  loading={i < 2 ? 'eager' : 'lazy'}
                  className="journey-push h-full w-full object-cover"
                />
                <div className="journey-clouds absolute inset-0" />
                <div className="journey-flicker absolute inset-0" />
              </div>
            </div>
          );
        })}

        {/* Flash as the camera passes through a frame. */}
        <div
          className="pointer-events-none absolute inset-0 z-20 bg-amber-100 mix-blend-overlay"
          style={{
            opacity:
              local > 0.9 && index < n - 1
                ? (local - 0.9) * 6
                : local < 0.08
                  ? (0.08 - local) * 8
                  : 0,
          }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-t from-black/80 via-black/10 to-black/50"
          aria-hidden
        />
        <div
          className="story-dust pointer-events-none absolute inset-0 z-20 opacity-60"
          aria-hidden
        />

        {/* HUD */}
        <div className="relative z-30 mx-auto flex h-full max-w-6xl flex-col px-4 pb-10 pt-24 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <div className="eyebrow text-amber-400">Путешествие по объекту</div>
            <div className="flex items-center gap-3 font-mono text-xs tabular-nums text-white/80 sm:text-sm">
              <span className="flex items-center gap-1.5 rounded bg-red-600/90 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-widest text-white">
                <span className="journey-rec h-1.5 w-1.5 rounded-full bg-white" />
                Онлайн
              </span>
              <span className="hidden sm:inline">Камера {String(index + 1).padStart(2, '0')}</span>
              <span>{clock}</span>
            </div>
          </div>

          <div className="mt-auto max-w-2xl">
            {scenes.map((scene, i) => {
              const shown = i === index;
              const fade = shown
                ? clamp(local < 0.5 ? (local - 0.12) / 0.2 : (0.7 - local) / 0.15)
                : 0;
              return (
                <div
                  key={scene.type}
                  className={`${shown ? '' : 'pointer-events-none absolute'} transition-none`}
                  style={{
                    opacity: i === n - 1 && shown ? clamp((local - 0.06) / 0.14) : fade,
                    transform: `translateY(${(1 - (i === n - 1 && shown ? 1 : fade)) * 24}px)`,
                  }}
                  aria-hidden={!shown}
                >
                  {shown && (
                    <>
                      <div className="font-mono text-xs uppercase tracking-[0.25em] text-amber-400">
                        {scene.place}
                      </div>
                      <h2 className="mt-3 text-4xl font-extrabold leading-[1.02] tracking-[-0.03em] drop-shadow-lg sm:text-6xl">
                        {scene.title}
                      </h2>
                      <p className="mt-4 max-w-xl text-lg text-white/80">{scene.text}</p>
                      <a
                        href={scene.href}
                        className="mt-6 inline-flex items-center gap-2 rounded-full bg-amber-500 px-6 py-3 font-semibold text-slate-950 transition hover:bg-amber-400"
                      >
                        {scene.cta} →
                      </a>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Route: the stops of the site, the current one lit. */}
          <ol className="mt-10 flex gap-2">
            {scenes.map((scene, i) => (
              <li key={scene.type} className="flex-1">
                <div className="h-0.5 overflow-hidden rounded-full bg-white/15">
                  <div
                    className="h-full bg-amber-400"
                    style={{ width: `${clamp(pos - i) * 100}%` }}
                  />
                </div>
                <div
                  className={`mt-2 hidden truncate font-mono text-[0.6rem] uppercase tracking-[0.2em] sm:block ${
                    i === index ? 'text-white' : 'text-white/40'
                  }`}
                >
                  {scene.place}
                </div>
              </li>
            ))}
          </ol>
        </div>

        <span className="absolute right-4 top-20 z-30 text-[0.6rem] text-white/40">
          Фото для примера
        </span>
      </div>
    </section>
  );
}
