'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { setSoundEnabled, soundEnabled, subscribeSound, SOUND_HINT_KEY } from '@/lib/sound';

const HINT_MS = 5000;

/**
 * «🔊 Звук» / «🔇»: the one switch of the cinematic sound layer. Sound is on
 * from the first tap unless the visitor turned it off; the choice is
 * remembered (lib/sound.ts).
 * Shows a one-time hint per session, after the opening titles.
 */
export function SoundToggle({ className = '' }: { className?: string }) {
  const on = useSyncExternalStore(subscribeSound, soundEnabled, () => false);
  const [hint, setHint] = useState(false);

  useEffect(() => {
    if (soundEnabled()) return;
    try {
      if (sessionStorage.getItem(SOUND_HINT_KEY)) return;
    } catch {
      return;
    }
    let showTimer = 0;
    let hideTimer = 0;
    let poll = 0;
    const show = () => {
      if (soundEnabled()) return;
      try {
        sessionStorage.setItem(SOUND_HINT_KEY, '1');
      } catch {
        /* shown once per page then */
      }
      setHint(true);
      hideTimer = window.setTimeout(() => setHint(false), HINT_MS);
    };
    // Wait for the opening titles (IntroSplash) to finish first.
    const introOn = () => {
      const intro = document.getElementById('intro');
      return !!intro && !intro.hidden;
    };
    let waited = 0;
    poll = window.setInterval(() => {
      waited += 250;
      if (introOn() && waited < 12000) return;
      window.clearInterval(poll);
      showTimer = window.setTimeout(show, waited > 250 ? 1500 : 2500);
    }, 250);
    return () => {
      window.clearInterval(poll);
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  useEffect(() => {
    if (on) setHint(false);
  }, [on]);

  return (
    <span className={`relative inline-flex ${className}`}>
      <button
        type="button"
        data-sound-toggle
        onClick={() => setSoundEnabled(!soundEnabled())}
        aria-pressed={on}
        aria-label={on ? 'Выключить звук' : 'Включить звук'}
        title={on ? 'Выключить звук' : 'Включить звук — как в кино'}
        className={`inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-full px-2 text-sm font-semibold ring-1 transition ${
          on
            ? 'bg-amber-500 text-slate-950 ring-amber-500'
            : 'text-slate-600 ring-slate-300 hover:bg-slate-100'
        }`}
      >
        <span aria-hidden>{on ? '🔊' : '🔇'}</span>
        {on && <span className="hidden sm:inline">Звук</span>}
      </button>
      {hint && (
        <span
          role="status"
          className="sound-hint pointer-events-none absolute right-0 top-full z-50 mt-2 whitespace-nowrap rounded-full bg-slate-900/90 px-3 py-1.5 text-xs font-medium text-white shadow-lg"
        >
          Включите звук — как в кино
        </span>
      )}
    </span>
  );
}
