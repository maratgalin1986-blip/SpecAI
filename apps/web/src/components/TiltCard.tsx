'use client';

import { useRef, type ReactNode } from 'react';

// Card that tilts gently towards the mouse on desktop, with a moving light
// glare; an element inside marked `tilt-zoom` (usually the photo) drifts
// closer on hover. On touch screens there is no tilt (it rasterised the text
// soft and cost frames while scrolling): the card sinks a little under the
// finger instead (globals.css, .tilt-card[data-pressed]). `className` replaces the default look
// (border, background, padding); `max` is the tilt at the card's edge, in
// degrees.
export function TiltCard({
  children,
  dark = false,
  className,
  max = 14,
}: {
  children: ReactNode;
  dark?: boolean;
  className?: string;
  max?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef(0);

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse') return;
    const el = ref.current;
    if (!el) return;
    // A card with an open order form holds still, so the fields stay under the pointer.
    if (el.querySelector('form')) return;
    const { clientX, clientY } = event;
    // One style write per frame, however fast the mouse moves.
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      const x = (clientX - rect.left) / rect.width;
      const y = (clientY - rect.top) / rect.height;
      el.style.setProperty('--rx', `${(0.5 - y) * max}deg`);
      el.style.setProperty('--ry', `${(x - 0.5) * max}deg`);
      el.style.setProperty('--gx', `${x * 100}%`);
      el.style.setProperty('--gy', `${y * 100}%`);
    });
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse') return;
    ref.current?.setAttribute('data-pressed', '');
  }

  function release() {
    cancelAnimationFrame(frame.current);
    const el = ref.current;
    if (!el) return;
    el.removeAttribute('data-pressed');
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  }

  const look =
    className ??
    `rounded-xl border p-5 shadow-sm ${
      dark
        ? 'border-slate-700 bg-slate-800/80 text-white backdrop-blur'
        : 'border-slate-200 bg-white'
    }`;

  return (
    <div className="tilt-wrap h-full">
      <div
        ref={ref}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerUp={release}
        onPointerCancel={release}
        onPointerLeave={release}
        className={`tilt-card relative h-full overflow-hidden ${look}`}
      >
        <div className="tilt-content relative h-full">{children}</div>
        <div className={`tilt-glare ${className && !dark ? 'tilt-glare-light' : ''}`} />
      </div>
    </div>
  );
}
