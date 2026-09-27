'use client';

import { useRef, type ReactNode } from 'react';

// Card that tilts in 3D towards the pointer, with a moving light glare.
export function TiltCard({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el || event.pointerType !== 'mouse') return;
    const rect = el.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    el.style.setProperty('--rx', `${(0.5 - y) * 14}deg`);
    el.style.setProperty('--ry', `${(x - 0.5) * 14}deg`);
    el.style.setProperty('--gx', `${x * 100}%`);
    el.style.setProperty('--gy', `${y * 100}%`);
  }

  function onPointerLeave() {
    ref.current?.style.setProperty('--rx', '0deg');
    ref.current?.style.setProperty('--ry', '0deg');
  }

  return (
    <div className="tilt-wrap h-full">
      <div
        ref={ref}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        className={`tilt-card relative h-full overflow-hidden rounded-xl border p-5 shadow-sm ${
          dark
            ? 'border-slate-700 bg-slate-800/80 text-white backdrop-blur'
            : 'border-slate-200 bg-white'
        }`}
      >
        <div className="tilt-glare" />
        <div className="tilt-content relative">{children}</div>
      </div>
    </div>
  );
}
