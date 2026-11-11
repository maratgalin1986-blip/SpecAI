'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { currentShowLevel } from '@/lib/showGate';
import { confettiPieces, type Piece } from '@/lib/confetti';
import { playCue } from '@/lib/sound';

// A short celebration for a finished action (a заявка is sent): confetti flies
// out of the middle of the screen and falls, the stamp sound plays (with the
// quiet chime after it). Opacity and transform only, no pointer events: the
// next button is never covered or delayed, and the layer removes itself after
// two and a half seconds. Full show: 28 pieces; calm (data saver, weak phone):
// 10 and a lower flight; off (reduced motion) and pages without the show:
// nothing but the sound.
export function Celebrate({ sound = true }: { sound?: boolean }) {
  const [pieces, setPieces] = useState<Piece[]>([]);

  useEffect(() => {
    if (sound) playCue('stamp');
    const level = currentShowLevel(window.location.pathname);
    if (!level || level === 'off') return;
    setPieces(confettiPieces(level === 'full' ? 28 : 10, level === 'full' ? 1 : 0.6));
    const timer = window.setTimeout(() => setPieces([]), 2500);
    return () => window.clearTimeout(timer);
  }, [sound]);

  if (pieces.length === 0) return null;
  // In <body>, not in the card: a transformed or clipped ancestor (the hero, a
  // scroll-driven block) would otherwise cut the flight short.
  return createPortal(
    <div className="show-confetti" aria-hidden data-testid="celebrate">
      {pieces.map((p, i) => (
        <i
          key={i}
          style={
            {
              '--dx': `${p.dx}px`,
              '--up': `${p.up}px`,
              '--fall': `${p.fall}px`,
              '--r': `${p.r}deg`,
              '--d': `${p.d}ms`,
              '--t': `${p.t}ms`,
            } as CSSProperties
          }
        />
      ))}
    </div>,
    document.body,
  );
}
