'use client';

// The walk through the city (owner, 2026-11-10): state, history, keys, camera
// stops, goals and sound cues, and the controls with the card of each stop.
// Without the live scene every stop shows its own picture (rendered from the
// same scene with the camera of that stop) with a slow move across it.
// Loaded only when the visitor opens the walk, so the home page's first chunk
// does not carry any of it.
import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from 'react';
import { SoundToggle } from '@/components/SoundToggle';
import { reachGoal } from '@/lib/marketing';
import { SITE } from '@/lib/site';
import { announceMachine, playCue } from '@/lib/sound';
import { kindInfo, type WorldKind } from './kinds';
import type { WorldHandle } from './scene';
import {
  isWalkHistory,
  nextIndex,
  posterShape,
  STOP_POSTER_ALT,
  stopPoster,
  walkAutoplay,
  walkCard,
  walkReducer,
  withoutWalkParam,
  WALK_CLOSED,
  WALK_DWELL_MS,
  WALK_HISTORY_KEY,
  WALK_PRICE_TYPE,
  WALK_STOPS,
} from './walk';

export interface WalkBridge {
  goto(index: number): void;
  arrived(index: number): void;
}

const FOCUSABLE = 'button:not([disabled]), a[href]';

export default function WalkController({
  categoryIds,
  state,
  handleRef,
  boxRef,
  bridgeRef,
  fromUrl,
  onClose,
}: {
  categoryIds: Partial<Record<WorldKind, string>>;
  state: 'poster' | 'loading' | 'ready';
  handleRef: MutableRefObject<WorldHandle | null>;
  boxRef: RefObject<HTMLDivElement | null>;
  bridgeRef: MutableRefObject<WalkBridge | null>;
  fromUrl: boolean;
  onClose: () => void;
}) {
  const exitRef = useRef<HTMLButtonElement>(null);
  const [walk, dispatch] = useReducer(walkReducer, WALK_CLOSED, (closed) =>
    walkReducer(closed, {
      type: 'open',
      index: 0,
      paused: !walkAutoplay(window.matchMedia('(prefers-reduced-motion: reduce)').matches),
    }),
  );
  const [arrived, setArrived] = useState(false);
  const inScene = useRef(false);
  const seen = useRef(new Set<number>());
  const indexRef = useRef(walk.index);
  indexRef.current = walk.index;

  // The scene tells which stop its camera reached; a tap on a machine jumps to its stop.
  useEffect(() => {
    bridgeRef.current = {
      goto: (index) => dispatch({ type: 'goto', index }),
      arrived: (index) => {
        if (indexRef.current === index) setArrived(true);
      },
    };
    return () => {
      bridgeRef.current = null;
    };
  }, [bridgeRef]);

  // History: the walk is one entry, so the browser's Back button closes it.
  useEffect(() => {
    try {
      let url = location.href;
      if (fromUrl) {
        // A reload must not open the walk again: drop the flag from the address first.
        url = withoutWalkParam(location.pathname, location.search, location.hash);
        history.replaceState(history.state, '', url);
      }
      history.pushState({ [WALK_HISTORY_KEY]: true }, '', url);
    } catch {
      /* history blocked: the exit button still closes the walk */
    }
    reachGoal('walk_open');
    const onPop = () => {
      if (!isWalkHistory(history.state)) onClose();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [fromUrl, onClose]);

  // Closing never waits for the browser: the walk closes at once and, when its history
  // entry is still the current one, the entry is taken off as well.
  const closeWalk = useCallback(() => {
    let own = false;
    try {
      own = isWalkHistory(history.state);
    } catch {
      /* history blocked */
    }
    onClose();
    if (own) {
      try {
        history.back();
      } catch {
        /* nothing to take off */
      }
    }
  }, [onClose]);

  // No page scroll, keys, a focus loop.
  useEffect(() => {
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = 'hidden';
    exitRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeWalk();
      } else if (event.key === 'ArrowRight') {
        dispatch({ type: 'next' });
      } else if (event.key === 'ArrowLeft') {
        dispatch({ type: 'prev' });
      } else if (event.key === 'Tab') {
        const items = boxRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
        if (!items?.length) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        } else if (!boxRef.current?.contains(document.activeElement)) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      root.style.overflow = before;
    };
  }, [boxRef, closeWalk]);

  // The camera follows the stop; without the live scene the picture of the stop is shown.
  useEffect(() => {
    setArrived(false);
    const handle = handleRef.current;
    if (state === 'ready' && handle) {
      if (inScene.current) handle.walkTo(walk.index);
      else {
        inScene.current = true;
        handle.walkStart(walk.index);
      }
      return;
    }
    inScene.current = false;
    const id = window.setTimeout(() => setArrived(true), 900);
    return () => window.clearTimeout(id);
  }, [walk.index, state, handleRef]);
  useEffect(
    () => () => {
      if (inScene.current) handleRef.current?.walkEnd();
    },
    [handleRef],
  );

  // Pictures instead of the live scene: no WebGL, data saver, a weak phone, the
  // scene is still loading, or the frame-rate guard gave up in the middle of the walk.
  const fallback = state !== 'ready';
  const [pictures, setPictures] = useState(fallback);
  const [shape, setShape] = useState(() => posterShape(window.innerWidth / window.innerHeight));
  useEffect(() => {
    if (fallback) setPictures(true);
  }, [fallback]);
  useEffect(() => {
    const onResize = () => setShape(posterShape(window.innerWidth / window.innerHeight));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  // The picture of the stop just left stays underneath while the new one fades in.
  const trail = useRef<[number | null, number]>([null, walk.index]);
  if (trail.current[1] !== walk.index) trail.current = [trail.current[1], walk.index];
  const shownStops = pictures
    ? [trail.current[0], walk.index].filter((i): i is number => i !== null)
    : [];
  // The next picture is fetched while the visitor looks at this one.
  useEffect(() => {
    if (!fallback) return;
    const next = new Image();
    next.src = stopPoster(WALK_STOPS[nextIndex(walk.index)]!.kind, shape);
  }, [fallback, walk.index, shape]);

  // The tour moves on by itself after a rest at the stop, unless paused.
  useEffect(() => {
    if (walk.paused || !arrived) return;
    const id = window.setTimeout(() => dispatch({ type: 'next' }), WALK_DWELL_MS);
    return () => window.clearTimeout(id);
  }, [walk.paused, arrived, walk.index]);

  // Goals, sound cues and the machine's own sound, through the existing layers.
  useEffect(() => {
    if (!seen.current.has(walk.index)) {
      seen.current.add(walk.index);
      reachGoal('walk_stop');
    }
    playCue('whoosh');
    announceMachine('scene', WALK_PRICE_TYPE[WALK_STOPS[walk.index]!.kind]);
  }, [walk.index]);
  useEffect(() => () => announceMachine('scene', null), []);

  const card = walkCard(walk.index, categoryIds);
  return (
    <>
      {pictures && (
        <div
          className={`w3d-stops ${fallback ? 'opacity-100' : 'opacity-0'}`}
          aria-hidden={!fallback}
          data-shape={shape}
        >
          {shownStops.map((index) => {
            const kind = WALK_STOPS[index]!.kind;
            return (
              <img
                key={index}
                src={stopPoster(kind, shape)}
                alt={index === walk.index ? STOP_POSTER_ALT[kind] : ''}
                data-stop={kind}
                data-current={index === walk.index ? '' : undefined}
                decoding="async"
                className={index === walk.index ? 'w3d-stop-img w3d-stop-in' : 'w3d-stop-img'}
              />
            );
          })}
        </div>
      )}
      <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          ref={exitRef}
          type="button"
          onClick={closeWalk}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-bold text-slate-900 shadow-lg hover:bg-amber-100"
        >
          <span aria-hidden className="text-lg leading-none">
            ✕
          </span>
          Выйти из прогулки
        </button>
        <span className="rounded-full bg-white/90 text-slate-900 shadow-lg">
          <SoundToggle iconOnPhone large />
        </span>
      </div>
      <div
        className="absolute inset-x-0 top-[calc(max(0.75rem,env(safe-area-inset-top))+3.5rem)] z-10 flex justify-center gap-2"
        role="group"
        aria-label="Остановки прогулки"
      >
        {WALK_STOPS.map((stop, index) => (
          <button
            key={stop.kind}
            type="button"
            onClick={() => dispatch({ type: 'goto', index })}
            aria-label={`Остановка ${index + 1}: ${kindInfo(stop.kind).title}`}
            aria-current={index === walk.index ? 'step' : undefined}
            className="flex h-8 w-8 items-center justify-center"
          >
            <span
              className={`block h-2.5 rounded-full transition-all ${
                index === walk.index ? 'w-8 bg-amber-400' : 'w-2.5 bg-white/70'
              }`}
            />
          </button>
        ))}
      </div>
      <p className="w3d-hint motion-reduce:hidden pointer-events-none absolute inset-x-0 top-[34%] z-10 text-center text-sm font-semibold text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]">
        Потяните в сторону, чтобы осмотреться
      </p>
      <div
        key={walk.index}
        className="w3d-card absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-10 mx-auto rounded-2xl bg-slate-950/85 p-4 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur sm:w-[34rem]"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">
            {card.counter}
          </p>
          <div className="flex items-center gap-1.5 [&>button]:flex-1 sm:[&>button]:flex-none">
            <button
              type="button"
              onClick={() => dispatch({ type: 'prev' })}
              className="inline-flex min-h-10 items-center rounded-full bg-white/10 px-3 text-sm font-semibold hover:bg-white/20"
            >
              <span aria-hidden>‹</span>&nbsp;Назад
            </button>
            <button
              type="button"
              onClick={() => {
                playCue('click');
                dispatch({ type: 'toggle-pause' });
              }}
              aria-pressed={walk.paused}
              className="inline-flex min-h-10 min-w-[5.5rem] items-center justify-center rounded-full bg-white/10 px-3 text-sm font-semibold hover:bg-white/20"
            >
              {walk.paused ? (
                <>
                  <span aria-hidden>▶</span>&nbsp;Играть
                </>
              ) : (
                <>
                  <span aria-hidden>❚❚</span>&nbsp;Пауза
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: 'next' })}
              className="inline-flex min-h-10 items-center rounded-full bg-amber-400 px-3 text-sm font-bold text-slate-950 hover:bg-amber-300"
            >
              Дальше&nbsp;<span aria-hidden>›</span>
            </button>
          </div>
        </div>
        <p aria-live="polite" className="mt-2 text-xl font-bold leading-tight">
          {card.title}
        </p>
        <p className="mt-0.5 text-base font-semibold text-amber-300">{card.price}</p>
        <p className="mt-1 text-sm text-slate-300">{card.text}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <a
            href={card.orderHref}
            onClick={() => {
              reachGoal('walk_order');
              playCue('thunk');
            }}
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-amber-400 px-4 font-bold text-slate-950 hover:bg-amber-300"
          >
            Заказать
          </a>
          <a
            href={SITE.phoneHref}
            onClick={() => playCue('thunk')}
            className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/40 px-4 font-bold text-white hover:bg-white/10"
          >
            Позвонить
          </a>
        </div>
      </div>
    </>
  );
}
