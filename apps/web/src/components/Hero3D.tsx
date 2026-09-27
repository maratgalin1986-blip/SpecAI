'use client';

import { useEffect, useRef, useState } from 'react';
import type { MachinesScene } from '@/lib/machinesScene';

// Mounts the three.js machines scene. three.js is loaded lazily so the rest
// of the page renders (and stays interactive) before the 3D kicks in.
export function Hero3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<MachinesScene>();
  const [machines, setMachines] = useState<string[]>([]);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function onPointer(event: PointerEvent) {
      sceneRef.current?.setPointer(event.clientX, event.clientY);
    }

    function onPointerDown(event: PointerEvent) {
      onPointer(event);
      sceneRef.current?.setPressed(true);
      sceneRef.current?.poke(event.clientX, event.clientY);
    }

    function onPointerUp() {
      sceneRef.current?.setPressed(false);
    }

    // Stop rendering while the hero is scrolled out of view.
    const visibility = new IntersectionObserver(([entry]) => {
      sceneRef.current?.setRunning(entry?.isIntersecting ?? true);
    });

    import('@/lib/machinesScene')
      .then(({ createMachinesScene }) => {
        if (cancelled) return;
        try {
          sceneRef.current = createMachinesScene(container, {
            reducedMotion,
            onChange: setCurrent,
          });
        } catch {
          return; // No WebGL — the gradient backdrop stays as a fallback.
        }
        setMachines(sceneRef.current.machines);
        setCurrent(sceneRef.current.current);
        visibility.observe(container);
        window.addEventListener('pointermove', onPointer);
        window.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerUp);
        window.addEventListener('blur', onPointerUp);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      visibility.disconnect();
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('blur', onPointerUp);
      sceneRef.current?.dispose();
      sceneRef.current = undefined;
    };
  }, []);

  const isReady = machines.length > 0;

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="relative min-h-0 flex-1">
        <div
          ref={containerRef}
          aria-hidden
          className={`absolute inset-0 transition-opacity duration-1000 lg:[mask-image:linear-gradient(to_right,transparent,black_18%)] ${
            isReady ? 'opacity-100' : 'opacity-0'
          }`}
        />
      </div>
      {isReady && (
        <div className="relative z-10 flex flex-col items-center gap-2 px-4 pb-5">
          <div className="rounded-full bg-slate-900/70 px-4 py-1 text-sm font-semibold text-amber-400 ring-1 ring-amber-500/40 backdrop-blur">
            На площадке: {machines[current]}
          </div>
          <div className="flex flex-wrap justify-center gap-1.5">
            {machines.map((name, index) => (
              <button
                key={name}
                type="button"
                onClick={() => sceneRef.current?.show(index)}
                aria-label={`Показать: ${name}`}
                aria-pressed={index === current}
                className={`rounded-full px-2.5 py-1 text-xs font-medium backdrop-blur transition ${
                  index === current
                    ? 'bg-amber-500 text-slate-900'
                    : 'bg-white/10 text-slate-200 hover:bg-white/20'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
          <div className="text-xs text-slate-400">
            <span className="hidden sm:inline">
              Ведите курсором — техника поедет следом. Зажмите кнопку мыши — включит фары, кликните
              по машине — обрадуется
            </span>
            <span className="sm:hidden">
              Коснитесь площадки — техника приедет, держите палец — включит фары
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
