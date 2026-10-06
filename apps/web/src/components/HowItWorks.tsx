'use client';

import { useEffect, useRef, useState } from 'react';
import { LoopVideo } from '@/components/LoopVideo';
import { reducedMotion, watchInView } from '@/lib/inView';
import { LOOPS, STEP_LOOPS } from '@/lib/loops';

// «Как это работает»: the four steps on a route. While the block is on screen
// the steps take turns every few seconds: the route line fills up to the
// current step, its card lifts, a thin bar shows the time left, and the film
// above shows that step (a short loop of real footage, lib/loops.ts). A tap
// on a step jumps to it and holds it for a while. With reduced motion nothing
// moves on its own: all steps read at once and the film stays on its poster.

const STEP_MS = 5000;
const HOLD_MS = 15000;

export function HowItWorks({ steps }: { steps: { title: string; text: string }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [inView, setInView] = useState(false);
  const [heldUntil, setHeldUntil] = useState(0);
  const [still, setStill] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  // Dot centres in the list, measured: the cards have different heights.
  const [centres, setCentres] = useState<number[]>([]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () =>
      setCentres(
        [...list.querySelectorAll<HTMLElement>('.route-step-dot')].map(
          (dot) =>
            dot.offsetTop + dot.offsetHeight / 2 + (dot.offsetParent as HTMLElement).offsetTop,
        ),
      );
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, []);
  const first = centres[0] ?? 0;
  const span = (centres[centres.length - 1] ?? 0) - first;
  const reach = still ? 1 : span > 0 ? ((centres[active] ?? first) - first) / span : 0;

  useEffect(() => {
    setStill(reducedMotion());
    const el = ref.current;
    if (!el) return;
    return watchInView(
      el,
      (entry) => {
        setInView(entry.isIntersecting);
        el.toggleAttribute('data-offscreen', !entry.isIntersecting);
      },
      { threshold: 0.3 },
    );
  }, []);

  // Advance while visible and not held by a tap.
  useEffect(() => {
    if (still || !inView) return;
    const wait = Math.max(STEP_MS, heldUntil - Date.now());
    const timer = window.setTimeout(() => setActive((i) => (i + 1) % steps.length), wait);
    return () => window.clearTimeout(timer);
  }, [active, inView, heldUntil, still, steps.length]);

  const pick = (index: number) => {
    setActive(index);
    setHeldUntil(Date.now() + HOLD_MS);
  };
  const held = heldUntil > Date.now();

  return (
    <div
      ref={ref}
      className="flex flex-col gap-5"
      data-held={held ? '' : undefined}
      style={{ ['--step-ms' as string]: `${held ? HOLD_MS : STEP_MS}ms` }}
    >
      <div className="relative aspect-[16/9] overflow-hidden rounded-3xl bg-slate-900 shadow-xl">
        {STEP_LOOPS.slice(0, steps.length).map((clip, index) => (
          <div
            key={clip}
            className="step-film absolute inset-0"
            data-active={index === active ? '' : undefined}
          >
            <LoopVideo
              clip={clip}
              active={index === active}
              alt={index === active ? LOOPS[clip].alt : ''}
              className="absolute inset-0 h-full w-full"
            />
          </div>
        ))}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent" />
        <div className="pointer-events-none absolute bottom-4 left-5 right-5 flex items-end justify-between gap-3 text-white">
          <span className="font-mono text-4xl font-bold leading-none text-amber-400">
            0{active + 1}
          </span>
          <span className="text-right text-base font-bold drop-shadow">{steps[active]?.title}</span>
        </div>
      </div>

      <div ref={listRef} className="relative">
        {span > 0 && (
          <div className="route-track" style={{ top: first, height: span }} aria-hidden>
            <div className="route-fill" style={{ ['--route' as string]: reach }} />
          </div>
        )}
        <ol className="flex flex-col gap-3">
          {steps.map((step, index) => {
            const on = still || index <= active;
            return (
              <li
                key={step.title}
                className="route-step relative"
                data-active={!still && index === active ? '' : undefined}
              >
                <button
                  type="button"
                  onClick={() => pick(index)}
                  aria-current={index === active ? 'step' : undefined}
                  className="flex w-full items-start gap-4 text-left"
                >
                  <span
                    className={`route-step-dot relative z-10 mt-3 grid h-12 w-12 shrink-0 place-items-center rounded-full font-mono text-base font-bold ring-4 ring-[#f7f7f5] ${
                      on ? 'bg-amber-500 text-slate-950' : 'bg-white text-slate-500 ring-offset-0'
                    }`}
                  >
                    0{index + 1}
                  </span>
                  <span
                    className={`route-step-body relative block flex-1 overflow-hidden rounded-3xl border bg-white p-5 ${
                      !still && index === active
                        ? 'border-amber-300 shadow-lg shadow-amber-500/10'
                        : 'border-slate-200'
                    }`}
                  >
                    <span className="block text-lg font-bold">{step.title}</span>
                    <span className="mt-1 block text-sm text-slate-600">{step.text}</span>
                    {!still && inView && index === active && (
                      <span
                        key={`${active}-${heldUntil}`}
                        className="route-progress absolute inset-x-0 bottom-0 h-1 bg-amber-500"
                        aria-hidden
                      />
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
