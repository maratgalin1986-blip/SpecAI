'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { defaultPhotoOf, pickPhoto, type MachineType } from '@/lib/machinePhotos';
import { currentSiteObject, SITE_OBJECTS, type ObjectStop } from '@/lib/siteObjects';
import { clipSources, footageAllowed, lightFootage } from '@/components/CinemaVideo';
import { LiveClock } from '@/components/LiveClock';
import { Icon } from '@/components/Icon';
import { useMachineSound } from '@/components/useMachineSound';
import { SITE } from '@/lib/site';

// «Путешествие по объекту»: a pinned, scroll-driven fly-through of one big
// construction site. Scroll scrubs the footage like film on an editing desk,
// forward and backward, with a little camera inertia; when the visitor stops
// scrolling the scene keeps living (the clip plays on in slow motion). Each stop is a looping clip of real footage (over a
// photo that shows while it loads); scrolling pulls the camera out of
// the previous shot, holds, then dives into a focal point (a load on the hook,
// the pit, the platform…) and comes out of the next shot — like an Apple-style
// scroll film. Every stop is also a section of the site with a link.

type Scene = {
  type: MachineType;
  /** Which clip of the visit's construction project plays here. */
  stop: ObjectStop;
  place: string;
  title: string;
  text: string;
  href: string;
  cta: string;
  /** Film-style subtitle with a call to action. */
  sub: string;
};

const SCENES: Scene[] = [
  {
    type: 'crane',
    stop: 'gate',
    place: 'Ворота объекта',
    title: 'Большая стройка начинается с техники',
    text: 'Автокраны, экскаваторы, манипуляторы и катки — весь парк в одном каталоге.',
    href: '/equipment',
    cta: 'Открыть каталог',
    sub: '— Что-то нужно на объект? Диспетчер на связи',
  },
  {
    type: 'excavator',
    stop: 'pit',
    place: 'Котлован',
    title: 'Копаем котлован под фундамент',
    text: 'Гусеничные экскаваторы и экскаваторы-погрузчики с опытными машинистами.',
    href: '/arenda/ekskavator-pogruzchik',
    cta: 'Экскаваторы',
    sub: '— Нужен такой же котлован? Диспетчер на связи',
  },
  {
    type: 'kmu',
    stop: 'yard',
    place: 'Склад материалов',
    title: 'Привезём и выгрузим',
    text: 'Манипулятор КМУ 7 т и самосвалы — от плит до контейнеров.',
    href: '/#podbor',
    cta: 'Подобрать технику',
    sub: '— Надо привезти и выгрузить? Расскажите, что и куда',
  },
  {
    type: 'agp',
    stop: 'height',
    place: 'Фасад',
    title: 'Работы на высоте',
    text: 'Автовышки АГП для фасадов, кровли и освещения.',
    href: '/equipment',
    cta: 'Автовышки',
    sub: '— Работы на высоте? Подскажем, какая вышка подойдёт',
  },
  {
    type: 'wheeled-excavator',
    stop: 'demolition',
    place: 'Демонтаж',
    title: 'Ломаем старое под новое',
    text: 'Колёсные экскаваторы с гидромолотом и ножницами — бетон, асфальт, перекрытия.',
    href: '/equipment',
    cta: 'Техника для демонтажа',
    sub: '— Есть что демонтировать? Опишите объект диспетчеру',
  },
  {
    type: 'trench',
    stop: 'finale',
    place: 'Ваш объект',
    title: 'Следующая остановка — ваша стройка',
    text: 'Оставьте заявку — подберём технику и назовём цену за 15 минут.',
    href: '/#callback',
    cta: 'Оставить заявку',
    sub: '— Ваш объект — следующий. Позвоните или оставьте наряд',
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
  // A different construction project on every visit (see siteObjects.ts).
  const [object, setObject] = useState(SITE_OBJECTS[0]!);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  // Clips are mounted only after hydration, once this visit's project is
  // known, so the server-side default clips are never downloaded.
  const [mounted, setMounted] = useState(false);
  // Phones and 3G get the light cut of each clip (CinemaVideo).
  const [light, setLight] = useState(false);
  // Photos too: the stage is far below the fold, and the server-side default
  // photos would otherwise be fetched and then replaced by this visit's pick.
  const [hydrated, setHydrated] = useState(false);
  const [near, setNear] = useState(false);
  // The stage fills the screen (the visitor is inside the journey).
  const [onStage, setOnStage] = useState(false);
  const posRef = useRef(0);

  useEffect(() => {
    // The route between the gate and the finale is shuffled on every visit.
    const middle = SCENES.slice(1, -1).sort(() => Math.random() - 0.5);
    const route = [SCENES[0]!, ...middle, SCENES[SCENES.length - 1]!];
    setScenes(route);
    setPhotos(route.map((scene) => pickPhoto(scene.type, 'journey')));
    setObject(currentSiteObject());
    setLight(lightFootage());
    setMounted(footageAllowed());
    setHydrated(true);
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
      // Start fetching footage only when the stage is about to come in.
      setNear(rect.top < window.innerHeight * 1.5 && rect.bottom > -window.innerHeight);
      setOnStage(rect.top < window.innerHeight * 0.5 && rect.bottom > window.innerHeight * 0.5);
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

  // Scrubbing: while the visitor scrolls, each visible clip is paused and its
  // playhead eases towards the time that matches the scroll position; after
  // a short pause in scrolling the clip plays on at 0.7× from where it is.
  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    let lastScroll = 0;
    const heads: number[] = [];
    const onScroll = () => {
      lastScroll = performance.now();
    };
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const pos = posRef.current;
      const scrolling = performance.now() - lastScroll < 220;
      videoRefs.current.forEach((video, i) => {
        if (!video || !video.duration || video.readyState < 2) return;
        if (pos < i - 0.3 || pos > i + 1.1) {
          if (!video.paused) video.pause();
          return;
        }
        const span = video.duration * 0.92;
        // 0 when the camera arrives at this stop, 1 as it dives into the next.
        const local = clamp((pos - i + 0.3) / 1.3);
        const target = local * span;
        if (scrolling) {
          if (!video.paused) video.pause();
          const head = heads[i] ?? video.currentTime;
          const next = head + (target - head) * 0.22;
          heads[i] = next;
          if (!video.seeking && Math.abs(video.currentTime - next) > 0.03) {
            video.currentTime = next;
          }
        } else {
          heads[i] = video.currentTime;
          if (video.paused) {
            video.playbackRate = 0.7;
            void video.play().catch(() => {});
          }
        }
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [reduced]);

  // Sound (only when the visitor turned it on): each stop's machine while
  // the stage is on screen, cross-fading as the camera moves on.
  const stop = scenes[Math.min(scenes.length - 1, Math.floor(progress * scenes.length))];
  useMachineSound('journey', stop?.type, onStage && !reduced);

  // Reduced motion: a plain list of the stops.
  if (reduced) {
    return (
      <section aria-label="Путешествие по объекту" className="grid gap-4 sm:grid-cols-2">
        <h2 className="sr-only">Путешествие по объекту</h2>
        {scenes.map((scene) => (
          <div
            key={scene.type}
            className="overflow-hidden rounded-3xl border border-slate-200 bg-white"
          >
            <a href={scene.href} className="block">
              <Image
                src={photos[scenes.indexOf(scene)] ?? defaultPhotoOf(scene.type)}
                alt=""
                width={640}
                height={360}
                sizes="(min-width: 768px) 33vw, 100vw"
                className="aspect-video w-full object-cover"
              />
              <div className="p-5">
                <div className="eyebrow text-amber-700">{scene.place}</div>
                <h3 className="mt-2 text-xl font-bold">{scene.title}</h3>
              </div>
            </a>
            <div className="flex flex-wrap items-center gap-2 px-5 pb-5">
              <p className="w-full text-sm italic text-slate-600">{scene.sub}</p>
              <a
                href={SITE.phoneHref}
                className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
              >
                <Icon name="phone" className="h-4 w-4" /> {SITE.phone}
              </a>
              <a
                href={scene.type === 'trench' ? '/#podbor' : `/?m=${scene.type}#podbor`}
                className="inline-flex items-center rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950"
              >
                Наряд
              </a>
            </div>
          </div>
        ))}
      </section>
    );
  }

  const skip = () => {
    const el = sectionRef.current;
    if (el) window.scrollTo({ top: el.offsetTop + el.offsetHeight, behavior: 'smooth' });
  };

  const n = scenes.length;
  const pos = progress * n; // 0…n
  posRef.current = pos;
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
                {hydrated && (
                  <Image
                    src={photos[i]!}
                    alt=""
                    fill
                    sizes="100vw"
                    className="journey-push object-cover"
                  />
                )}
                {/* Real footage over the photo: people and machines at work. */}
                {mounted && (
                  <video
                    key={object.clips[scene.stop]}
                    ref={(el) => {
                      videoRefs.current[i] = el;
                    }}
                    className="journey-push absolute inset-0 h-full w-full object-cover"
                    muted
                    loop
                    playsInline
                    // Load a clip fully only when the camera gets close to it.
                    preload={near && pos > i - 1.5 ? 'auto' : 'none'}
                    poster={`/video/${object.clips[scene.stop]}.webp`}
                  >
                    {clipSources(object.clips[scene.stop]!, light)}
                  </video>
                )}
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
        <div className="relative z-30 mx-auto flex h-full max-w-6xl flex-col px-4 pb-24 pt-20 sm:px-6 sm:pb-10 sm:pt-24">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="eyebrow text-amber-400">Путешествие по объекту</div>
              <div className="mt-1 text-sm font-semibold text-white/90">{object.name}</div>
            </div>
            <div className="flex items-center gap-3 font-mono text-xs tabular-nums text-white/80 sm:text-sm">
              <span className="flex items-center gap-1.5 rounded bg-red-600/90 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-widest text-white">
                <span className="journey-rec h-1.5 w-1.5 rounded-full bg-white" />
                Онлайн
              </span>
              <span className="hidden sm:inline">Камера {String(index + 1).padStart(2, '0')}</span>
              <LiveClock />
            </div>
          </div>
          {/* Second HUD row: the note and (on phones) Skip, clear of the clock. */}
          <div className="mt-2 flex items-center justify-between gap-3 text-[0.6rem] text-white/50 sm:hidden">
            <span>Видео и фото для примера</span>
            <button
              type="button"
              onClick={skip}
              className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/80 ring-1 ring-white/20 backdrop-blur"
            >
              Пропустить ↓
            </button>
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

          {/* Film subtitle for the active stop; driven by the same state, no extra listeners. */}
          <div className="mt-6 flex min-h-[4.5rem] justify-center sm:min-h-[3.5rem]">
            {(() => {
              const scene = scenes[index]!;
              const on = index === n - 1 || (local > 0.05 && local < 0.92);
              return (
                <div
                  key={scene.type}
                  className={`flex max-w-full flex-col items-center gap-2 rounded-2xl bg-black/60 px-4 py-2.5 text-center backdrop-blur-sm transition duration-300 motion-reduce:transition-none sm:flex-row sm:gap-4 sm:rounded-full sm:px-5 ${
                    on ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'
                  }`}
                >
                  <p className="text-sm italic text-white sm:text-base">{scene.sub}</p>
                  <div className="flex items-center gap-2">
                    <a
                      href={SITE.phoneHref}
                      aria-label={`Позвонить: ${SITE.phone}`}
                      className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/25 hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
                    >
                      <Icon name="phone" className="h-3.5 w-3.5" /> {SITE.phone}
                    </a>
                    <a
                      href={scene.type === 'trench' ? '/#podbor' : `/?m=${scene.type}#podbor`}
                      className="inline-flex items-center rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                    >
                      Наряд
                    </a>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Route: the stops of the site, the current one lit. */}
          <ol className="mt-4 flex gap-2 sm:mt-6">
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

        <span className="absolute right-4 top-20 z-30 hidden text-[0.6rem] text-white/40 sm:block">
          Видео и фото для примера
        </span>
        {/* A long fly-through can be skipped. */}
        <button
          type="button"
          onClick={skip}
          className="absolute bottom-28 right-6 z-30 hidden rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/80 ring-1 ring-white/20 backdrop-blur hover:bg-white/20 sm:block"
        >
          Пропустить ↓
        </button>
      </div>
    </section>
  );
}
