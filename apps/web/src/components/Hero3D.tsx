'use client';

import { useEffect, useRef, useState } from 'react';
import type { MachinesScene } from '@/lib/machinesScene';
import { createSoundEngine, type SoundEngine } from '@/lib/machineSounds';

const SOUND_KEY = 'specplast16:sound';

function readSoundPreference() {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}

// Mounts the three.js machines scene. three.js is loaded lazily so the rest
// of the page renders (and stays interactive) before the 3D kicks in.
export function Hero3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<MachinesScene>();
  const soundRef = useRef<SoundEngine>();
  const [machines, setMachines] = useState<string[]>([]);
  const [current, setCurrent] = useState(0);
  const [soundOn, setSoundOn] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const initialSoundOn = readSoundPreference();
    setSoundOn(initialSoundOn);
    const sound = createSoundEngine(!initialSoundOn);
    soundRef.current = sound;

    function onPointer(event: PointerEvent) {
      sceneRef.current?.setPointer(event.clientX, event.clientY);
    }

    function onPointerDown(event: PointerEvent) {
      // Browsers only allow audio after a user gesture.
      sound.unlock();
      // Buttons and links (e.g. the machine picker) don't poke the machine.
      if (event.target instanceof Element && event.target.closest('a, button')) return;
      onPointer(event);
      sceneRef.current?.setPressed(true);
      sceneRef.current?.poke(event.clientX, event.clientY);
    }

    function onPointerUp() {
      sceneRef.current?.setPressed(false);
    }

    function onKeyDown() {
      sound.unlock();
    }

    function onVisibilityChange() {
      sound.setSuspended(document.hidden);
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
            sound,
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
        window.addEventListener('keydown', onKeyDown);
        document.addEventListener('visibilitychange', onVisibilityChange);
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
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      sceneRef.current?.dispose();
      sceneRef.current = undefined;
      sound.dispose();
      soundRef.current = undefined;
    };
  }, []);

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    soundRef.current?.unlock();
    soundRef.current?.setMuted(!next);
    if (next) soundRef.current?.play('horn');
    try {
      window.localStorage.setItem(SOUND_KEY, next ? 'on' : 'off');
    } catch {
      // Preference just won't persist.
    }
  }

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
        {isReady && (
          <button
            type="button"
            onClick={toggleSound}
            aria-pressed={soundOn}
            aria-label={soundOn ? 'Выключить звук' : 'Включить звук'}
            className="absolute right-4 top-4 z-10 flex items-center gap-1.5 rounded-full bg-slate-900/70 px-3 py-1.5 text-xs font-medium text-slate-200 ring-1 ring-white/20 backdrop-blur transition hover:bg-slate-800"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden
            >
              <path strokeLinejoin="round" d="M4 9h4l5-4v14l-5-4H4z" />
              {soundOn ? (
                <path strokeLinecap="round" d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
              ) : (
                <path strokeLinecap="round" d="m17 9 5 6m0-6-5 6" />
              )}
            </svg>
            {soundOn ? 'Звук вкл' : 'Звук выкл'}
          </button>
        )}
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
              по машине — погудит и обрадуется
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
