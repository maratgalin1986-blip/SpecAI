'use client';

import { useRef, useState } from 'react';

// Left-thumb virtual joystick: writes -1…1 into `input` (x right, y forward).
export function Joystick({ input }: { input: { joyX: number; joyY: number } }) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const pointer = useRef<number | null>(null);
  const R = 44;

  const update = (clientX: number, clientY: number) => {
    const rect = base.current!.getBoundingClientRect();
    let dx = clientX - (rect.left + rect.width / 2);
    let dy = clientY - (rect.top + rect.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > R) {
      dx = (dx / len) * R;
      dy = (dy / len) * R;
    }
    setKnob({ x: dx, y: dy });
    input.joyX = dx / R;
    input.joyY = -dy / R;
  };
  const end = () => {
    pointer.current = null;
    setKnob({ x: 0, y: 0 });
    input.joyX = 0;
    input.joyY = 0;
  };

  return (
    <div
      ref={base}
      data-testid="joystick"
      role="application"
      aria-label="Джойстик: идти"
      className="pointer-events-auto relative h-28 w-28 touch-none select-none rounded-full border border-white/25 bg-slate-950/40 backdrop-blur-sm"
      onPointerDown={(e) => {
        pointer.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (pointer.current === e.pointerId) update(e.clientX, e.clientY);
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div
        className="absolute left-1/2 top-1/2 h-12 w-12 rounded-full bg-amber-400/90 shadow-lg"
        style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
      />
    </div>
  );
}
