'use client';

// The 3D canvas. Loaded only on /stroyka through next/dynamic (ssr: false),
// so three.js never reaches the rest of the site.
import { useEffect, useRef } from 'react';
import type { ZoneId } from '@/lib/stroyka';
import { StroykaEngine, type SharedInput, type Telemetry } from './engine';
import type { AdTarget } from './world';

export type { StroykaEngine };

export default function StroykaWorld({
  mobile,
  input,
  telemetry,
  onEngine,
  onZone,
  onProgress,
  onWantFree,
  onAdClick,
  onDog,
  onIntroEnd,
  onPerson,
  onError,
}: {
  mobile: boolean;
  input: SharedInput;
  telemetry: Telemetry;
  onEngine: (engine: StroykaEngine | null) => void;
  onZone: (zone: ZoneId | null) => void;
  onProgress: (p: number) => void;
  onWantFree: () => void;
  onAdClick: (target: AdTarget) => void;
  onDog?: () => void;
  onIntroEnd?: () => void;
  onPerson?: (id: string, zone?: ZoneId) => void;
  onError: (error: unknown) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  // Callbacks change identity on every render; the engine reads the latest ones.
  const cb = useRef({
    onZone,
    onProgress,
    onWantFree,
    onAdClick,
    onDog,
    onIntroEnd,
    onPerson,
    onEngine,
    onError,
  });
  cb.current = {
    onZone,
    onProgress,
    onWantFree,
    onAdClick,
    onDog,
    onIntroEnd,
    onPerson,
    onEngine,
    onError,
  };

  useEffect(() => {
    let engine: StroykaEngine | null = null;
    let cancelled = false;
    StroykaEngine.create({
      canvas: canvas.current!,
      overlay: overlay.current!,
      mobile,
      input,
      telemetry,
      onZone: (z) => cb.current.onZone(z),
      onProgress: (p) => cb.current.onProgress(p),
      onWantFree: () => cb.current.onWantFree(),
      onAdClick: (m) => cb.current.onAdClick(m),
      onDog: () => cb.current.onDog?.(),
      onIntroEnd: () => cb.current.onIntroEnd?.(),
      onPerson: (id, z) => cb.current.onPerson?.(id, z),
    })
      .then((created) => {
        if (cancelled) {
          created.dispose();
          return;
        }
        engine = created;
        cb.current.onEngine(created);
      })
      .catch((error) => cb.current.onError(error));
    return () => {
      cancelled = true;
      engine?.dispose();
      cb.current.onEngine(null);
    };
  }, [mobile, input, telemetry]);

  return (
    <>
      <canvas
        ref={canvas}
        data-testid="stroyka-canvas"
        className="absolute inset-0 h-full w-full touch-none select-none"
        aria-label="Стройка в 3D"
      />
      <div ref={overlay} className="pointer-events-none absolute inset-0 overflow-hidden" />
    </>
  );
}
