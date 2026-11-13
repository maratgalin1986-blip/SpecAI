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
  useSyncExternalStore,
  type MutableRefObject,
  type RefObject,
} from 'react';
import { useSoundLive } from '@/components/useSoundLive';
import { reachGoal } from '@/lib/marketing';
import { SITE } from '@/lib/site';
import {
  announceMachine,
  playCue,
  setSoundEnabled,
  soundEnabled,
  startedByPress,
  subscribeSound,
} from '@/lib/sound';
import { WorldIcon } from './icons';
import { kindInfo, type WorldKind } from './kinds';
import type { WorldHandle } from './scene';
import {
  isWalkHistory,
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
  // The picture of the current stop is always in the page (hidden under the live
  // scene) and all four are fetched when the walk opens, so the moment the live
  // scene drops out its picture is already there: never a black screen.
  const fallback = state !== 'ready';
  const [shape, setShape] = useState(() => posterShape(window.innerWidth / window.innerHeight));
  useEffect(() => {
    const onResize = () => setShape(posterShape(window.innerWidth / window.innerHeight));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const preloaded = useRef<HTMLImageElement[]>([]);
  useEffect(() => {
    preloaded.current = WALK_STOPS.map((stop) => {
      const image = new Image();
      image.decoding = 'async';
      image.src = stopPoster(stop.kind, shape);
      return image;
    });
  }, [shape]);
  // The picture of the stop just left stays underneath while the new one fades in.
  const trail = useRef<[number | null, number]>([null, walk.index]);
  if (trail.current[1] !== walk.index) trail.current = [trail.current[1], walk.index];
  const shownStops = [fallback ? trail.current[0] : null, walk.index].filter(
    (i): i is number => i !== null,
  );
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [walk.index]);

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
      <div
        className={`w3d-stops ${fallback ? 'opacity-100' : 'opacity-0'}`}
        aria-hidden={!fallback}
        data-shape={shape}
        data-live={fallback ? '0' : '1'}
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
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] [&>*]:pointer-events-auto">
        <button
          ref={exitRef}
          type="button"
          onClick={closeWalk}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white/95 px-4 text-sm font-bold text-slate-900 shadow-lg hover:bg-amber-100"
        >
          <WorldIcon name="close" className="h-4 w-4" />
          Выйти из прогулки
        </button>
        <WalkSound />
      </div>
      {!fallback && (
        <p className="w3d-hint motion-reduce:hidden pointer-events-none absolute inset-x-0 top-[34%] z-10 text-center text-sm font-semibold text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]">
          Потяните в сторону, чтобы осмотреться
        </p>
      )}
      <div
        key={walk.index}
        className="w3d-card absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-10 rounded-2xl bg-slate-950/85 p-3 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur sm:inset-x-auto sm:bottom-6 sm:left-6 sm:w-[30rem] sm:p-4"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="-ml-1.5 flex" role="group" aria-label="Остановки прогулки">
            {WALK_STOPS.map((stop, index) => (
              <button
                key={stop.kind}
                type="button"
                onClick={() => dispatch({ type: 'goto', index })}
                aria-label={`Остановка ${index + 1}: ${kindInfo(stop.kind).title}`}
                aria-current={index === walk.index ? 'step' : undefined}
                className="flex h-11 w-7 items-center justify-center sm:w-8"
              >
                <span
                  className={`block h-2.5 rounded-full transition-all ${
                    index === walk.index ? 'w-6 bg-amber-400' : 'w-2.5 bg-white/60'
                  }`}
                />
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => dispatch({ type: 'prev' })}
              aria-label="Назад"
              className="inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-full bg-white/10 px-2.5 text-sm font-semibold hover:bg-white/20 sm:px-3"
            >
              <WorldIcon name="prev" className="h-4 w-4" />
              <span className="hidden sm:inline">Назад</span>
            </button>
            <button
              type="button"
              onClick={() => {
                playCue('click');
                dispatch({ type: 'toggle-pause' });
              }}
              aria-pressed={walk.paused}
              aria-label={walk.paused ? 'Играть' : 'Пауза'}
              className="inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-full bg-white/10 px-2.5 text-sm font-semibold hover:bg-white/20 sm:px-3"
            >
              <WorldIcon name={walk.paused ? 'play' : 'pause'} className="h-4 w-4" />
              <span className="hidden sm:inline">{walk.paused ? 'Играть' : 'Пауза'}</span>
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: 'next' })}
              className="inline-flex h-11 items-center gap-1 rounded-full bg-amber-400 pl-3.5 pr-2.5 text-sm font-bold text-slate-950 hover:bg-amber-300"
            >
              Дальше
              <WorldIcon name="next" className="h-4 w-4" />
            </button>
          </div>
        </div>
        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-amber-300">
          {card.counter}
        </p>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p aria-live="polite" className="text-lg font-bold leading-tight sm:text-xl">
              {card.title}
            </p>
            <p className="text-base font-semibold text-amber-300">{card.price}</p>
          </div>
          <button
            type="button"
            onClick={() => setMore((open) => !open)}
            aria-expanded={more}
            aria-controls="w3d-card-text"
            aria-label="Подробнее о технике"
            className="-mr-1.5 -mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-300 hover:bg-white/10 sm:hidden"
          >
            <WorldIcon name="info" className="h-5 w-5" />
          </button>
        </div>
        <p
          id="w3d-card-text"
          className={`mt-1 text-sm text-slate-300 ${more ? 'block' : 'hidden'} sm:block`}
        >
          {card.text}
        </p>
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <a
            href={card.orderHref}
            onClick={() => {
              reachGoal('walk_order');
              playCue('thunk');
            }}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-amber-400 px-4 font-bold text-slate-950 hover:bg-amber-300"
          >
            Заказать
          </a>
          <a
            href={SITE.phoneHref}
            onClick={() => playCue('thunk')}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/40 px-4 font-bold text-white hover:bg-white/10"
          >
            Позвонить
          </a>
        </div>
      </div>
    </>
  );
}

/**
 * The sound switch of the walk: the same layer as the site's SoundToggle
 * (lib/sound.ts), drawn with the walk's own icons.
 */
function WalkSound() {
  const enabled = useSyncExternalStore(subscribeSound, soundEnabled, () => true);
  const live = useSoundLive();
  const on = enabled && live;
  return (
    <button
      type="button"
      data-sound-toggle={enabled && !live ? undefined : ''}
      onClick={(event) => {
        if (startedByPress(event.currentTarget)) return;
        setSoundEnabled(!soundEnabled());
      }}
      aria-pressed={on}
      aria-label={on ? 'Выключить звук' : 'Включить звук'}
      title={on ? 'Выключить звук' : 'Включить звук'}
      className={`inline-flex h-11 w-11 items-center justify-center rounded-full shadow-lg ring-1 transition ${
        on
          ? 'bg-amber-400 text-slate-950 ring-amber-300'
          : 'bg-white/95 text-slate-700 ring-white hover:bg-amber-100'
      }`}
    >
      <WorldIcon name={on ? 'soundOn' : 'soundOff'} className="h-5 w-5" />
    </button>
  );
}
