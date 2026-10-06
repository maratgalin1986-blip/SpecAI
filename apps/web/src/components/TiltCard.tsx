'use client';

import { useRef, type ReactNode } from 'react';

// Card that tilts in 3D towards the pointer, with a moving light glare. An
// element inside marked `tilt-zoom` (usually the photo) zooms in on hover.
// `className` replaces the default look (border, background, padding);
// `max` is the tilt at the card's edge, in degrees.
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

  // Stronger lean than before; a touch press leans about 5 degrees.
  const boost = 1.5;

  function lean(event: React.PointerEvent<HTMLDivElement>, amount: number) {
    const el = ref.current;
    if (!el) return;
    // A card with an open order form holds still, so the fields stay under the pointer.
    if (el.querySelector('form')) {
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
      return;
    }
    const rect = el.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    el.style.setProperty('--rx', `${(0.5 - y) * amount}deg`);
    el.style.setProperty('--ry', `${(x - 0.5) * amount}deg`);
    el.style.setProperty('--gx', `${x * 100}%`);
    el.style.setProperty('--gy', `${y * 100}%`);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse') lean(event, max * boost);
    else if (event.pointerType === 'touch' && ref.current?.hasAttribute('data-touch')) {
      lean(event, 10);
    }
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'touch') return;
    ref.current?.setAttribute('data-touch', '1');
    lean(event, 10);
  }

  function onPointerLeave() {
    ref.current?.removeAttribute('data-touch');
    ref.current?.style.setProperty('--rx', '0deg');
    ref.current?.style.setProperty('--ry', '0deg');
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
        onPointerUp={onPointerLeave}
        onPointerCancel={onPointerLeave}
        onPointerLeave={onPointerLeave}
        className={`tilt-card relative h-full overflow-hidden ${look}`}
      >
        <div className="tilt-content relative h-full">{children}</div>
        <div className={`tilt-glare ${className && !dark ? 'tilt-glare-light' : ''}`} />
      </div>
    </div>
  );
}
