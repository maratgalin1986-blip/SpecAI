'use client';

import { useEffect } from 'react';
import type { MachineType } from '@/lib/machinePhotos';
import {
  announcedMachines,
  onCue,
  onMachine,
  setSoundEnabled,
  soundEnabled,
  storedSoundChoice,
  subscribeSound,
  type MachineSource,
} from '@/lib/sound';
import type { SoundEngine } from '@/lib/soundEngine';
import { asSpeaker } from '@/lib/soundVoices';
import { stripEmoji } from '@/lib/stripEmoji';

// The cinematic sound layer, mounted once in the layout. Off by default; it
// wakes only after the visitor turns it on (SoundToggle) and only inside a
// gesture, as browsers require. Until then it downloads nothing: the engine,
// its synthesis code and the recordings load with import()/fetch on demand.
//
// Components only announce what is on screen (lib/sound.ts: playCue,
// announceMachine, useMachineSound); a 3D scene can also dispatch
// `sp:scene` {machine, active} and `sp:dialog` {speaker, text, kind, mood}.

const GESTURES = ['pointerdown', 'keydown', 'touchend', 'click', 'scroll', 'wheel'] as const;
const FIELD =
  'input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea, select';

type Pick = { source: MachineSource; type: MachineType; at: number };

export function SoundDirector() {
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let ctx: AudioContext | null = null;
    let engine: SoundEngine | null = null;
    let loading: Promise<SoundEngine | null> | null = null;
    let listening = false;
    let typing = false;
    let disposed = false;
    let wasRunning = false;
    let introPoll = 0;
    let lastWhoosh = 0;
    let introAtGesture = false;
    const machines = new Map<MachineSource, Pick>();
    announcedMachines().forEach((type, source) => machines.set(source, { source, type, at: 0 }));
    let playing: string | null = null;

    const current = (): Pick | null => {
      let best: Pick | null = null;
      machines.forEach((pick) => {
        if (!best || pick.at > best.at) best = pick;
      });
      return best;
    };

    const live = () => !!engine && engine.running && soundEnabled() && !disposed;

    const applyMachine = (arrive: boolean) => {
      if (!engine || !live()) return;
      const pick = current();
      const key = pick ? `${pick.source}:${pick.type}` : null;
      if (key === playing) return;
      const sameType = pick && playing?.endsWith(`:${pick.type}`);
      playing = key;
      void engine.setMachine(pick?.type ?? null, {
        arrive: arrive && !!pick && pick.source !== 'page' && !sameType,
        quiet: pick?.source === 'page',
      });
    };

    const loadEngine = () => {
      loading ??= import('@/lib/soundEngine')
        .then((mod) => {
          if (disposed || !ctx) return null;
          engine = new mod.SoundEngine(ctx);
          engine.duck(typing);
          return engine;
        })
        .catch(() => null);
      return loading;
    };

    /** Everything that starts once the context runs: beds, machine, intro. */
    const onRunning = () => {
      if (!engine || !live()) return;
      removeGestures();
      void engine.startBeds();
      playing = null;
      applyMachine(true);
      // Sound came on while the opening titles are up: the brass hit for the
      // partner card, and a whoosh as the camera dives in.
      if (introAtGesture && !wasRunning) {
        void engine.cue('boom');
        window.clearInterval(introPoll);
        introPoll = window.setInterval(() => {
          const el = document.getElementById('intro');
          if (el && !el.hidden) return;
          window.clearInterval(introPoll);
          void engine?.cue('whoosh');
        }, 150);
      }
      wasRunning = true;
    };

    /** Called inside a gesture: the context must be created/resumed right here. */
    const wake = () => {
      if (disposed || !soundEnabled() || document.visibilityState !== 'visible') return;
      if (!ctx) {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        try {
          ctx = new Ctor();
        } catch {
          return;
        }
      }
      const context = ctx;
      // The tap that wakes the sound also skips the opening titles, so look now.
      const intro = document.getElementById('intro');
      introAtGesture = !!intro && !intro.hidden;
      // iOS unlocks audio only for a sound started inside the gesture.
      try {
        const silent = context.createBufferSource();
        silent.buffer = context.createBuffer(1, 1, 22050);
        silent.connect(context.destination);
        silent.start(0);
      } catch {
        /* optional */
      }
      const resumed = context.state === 'running' ? Promise.resolve() : context.resume();
      void Promise.all([resumed.catch(() => {}), loadEngine()]).then(() => {
        if (context.state === 'running') onRunning();
      });
    };

    const onGesture = () => {
      // A scroll restored by the browser is not the visitor's gesture: wait
      // for one that lets audio start (no context is created before it).
      const activation = (navigator as Navigator & { userActivation?: { isActive: boolean } })
        .userActivation;
      if (activation && !activation.isActive) return;
      wake();
    };
    const addGestures = () => {
      if (listening) return;
      listening = true;
      GESTURES.forEach((name) =>
        window.addEventListener(name, onGesture, { passive: true, capture: true }),
      );
    };
    const removeGestures = () => {
      if (!listening) return;
      listening = false;
      GESTURES.forEach((name) => window.removeEventListener(name, onGesture, { capture: true }));
    };

    // The switch: on → wake now (the press is a gesture); off → fade and sleep.
    let wasOn = soundEnabled();
    const unsubscribe = subscribeSound(() => {
      const on = soundEnabled();
      if (on === wasOn) return;
      wasOn = on;
      if (on) {
        addGestures();
        wake();
        window.setTimeout(() => void engine?.cue('click'), 60);
      } else {
        removeGestures();
        playing = null;
        if (engine) {
          engine.stopBeds();
          void engine.setMachine(null);
          const e = engine;
          window.setTimeout(() => {
            if (!soundEnabled()) e.suspend();
          }, 900);
        }
      }
    });

    // A saved «on» resumes on the first tap/scroll/key of this page. Never
    // under reduced motion: there sound starts only from the switch itself.
    if (!reduced && storedSoundChoice()) {
      // Before the store changes, so the switch listener does not wake now.
      wasOn = true;
      setSoundEnabled(true, false);
      addGestures();
    }

    const onVisibility = () => {
      if (!engine) return;
      if (document.visibilityState === 'hidden') {
        engine.hush();
        engine.suspend();
      } else if (soundEnabled()) {
        void engine.resume().then((ok) => {
          if (ok) onRunning();
          else addGestures();
        });
      }
    };

    const isField = (el: EventTarget | null) => el instanceof Element && el.matches(FIELD);
    const onFocusIn = (event: FocusEvent) => {
      if (!isField(event.target)) return;
      typing = true;
      engine?.duck(true);
    };
    const onFocusOut = () => {
      window.setTimeout(() => {
        if (isField(document.activeElement)) return;
        typing = false;
        engine?.duck(false);
      }, 0);
    };

    // A whoosh when leaving the page (the curtain of the next one).
    const whoosh = () => {
      if (!live() || performance.now() - lastWhoosh < 800) return;
      lastWhoosh = performance.now();
      void engine!.cue('whoosh');
    };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return;
      const link = (event.target as Element | null)?.closest?.(
        'a[href]',
      ) as HTMLAnchorElement | null;
      if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
      try {
        const url = new URL(link.href, location.href);
        if (url.origin !== location.origin) return;
        if (url.pathname === location.pathname && url.search === location.search) return;
        whoosh();
      } catch {
        /* not a page link */
      }
    };

    const offCue = onCue(({ cue, machine }) => {
      if (live()) void engine!.cue(cue, machine);
    });
    const offMachine = onMachine(({ source, type }) => {
      if (type) machines.set(source, { source, type, at: performance.now() });
      else machines.delete(source);
      applyMachine(true);
    });

    // Events from the 3D construction-site page.
    const onScene = (event: Event) => {
      const detail = (event as CustomEvent<{ machine?: MachineType; active?: boolean }>).detail;
      if (!detail?.machine) return;
      if (detail.active) {
        machines.set('scene', { source: 'scene', type: detail.machine, at: performance.now() });
      } else if (machines.get('scene')?.type === detail.machine) {
        machines.delete('scene');
      }
      applyMachine(true);
    };
    const onDialog = (event: Event) => {
      const detail = (
        event as CustomEvent<{ speaker?: string; text?: string; kind?: string; mood?: string }>
      ).detail;
      if (!live() || !detail?.text) return;
      // Only the people talk: the site dog («Гав!») and other extras stay silent here.
      if (detail.speaker === 'dog') return;
      // Emojis are display-only; speechSynthesis would read them aloud.
      const text = stripEmoji(String(detail.text));
      if (!text) return;
      engine!.dialog({
        speaker: asSpeaker(detail.speaker),
        text,
        kind: detail.kind === 'business' || detail.kind === 'radio' ? detail.kind : 'joke',
        mood: typeof detail.mood === 'string' ? detail.mood : undefined,
      });
    };

    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('click', onClick);
    window.addEventListener('pageswap', whoosh);
    window.addEventListener('sp:scene', onScene);
    window.addEventListener('sp:dialog', onDialog);

    return () => {
      disposed = true;
      unsubscribe();
      offCue();
      offMachine();
      removeGestures();
      window.clearInterval(introPoll);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('click', onClick);
      window.removeEventListener('pageswap', whoosh);
      window.removeEventListener('sp:scene', onScene);
      window.removeEventListener('sp:dialog', onDialog);
      if (engine) engine.dispose();
      else void ctx?.close().catch(() => {});
      engine = null;
      ctx = null;
    };
  }, []);

  return null;
}
