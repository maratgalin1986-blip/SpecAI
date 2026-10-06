'use client';

import { useEffect } from 'react';
import type { MachineType } from '@/lib/machinePhotos';
import {
  announcedMachines,
  MIC_EVENT,
  onCue,
  onMachine,
  prefersReducedMotion,
  setSoundEnabled,
  soundEnabled,
  storedSoundChoice,
  subscribeSound,
  type MachineSource,
} from '@/lib/sound';
import type { SoundEngine } from '@/lib/soundEngine';
import { asSpeaker } from '@/lib/soundVoices';
import { stripEmoji } from '@/lib/stripEmoji';
import { currentNature, NATURE_EVENT, type NatureEventDetail } from '@/lib/sceneEvents';

// The cinematic sound layer, mounted once in the layout. On by default; it
// wakes at the visitor's first real gesture (or the SoundToggle press), as
// browsers require: no AudioContext exists before that. Until then it
// downloads nothing: the engine and the recordings load with import()/fetch
// on demand (the beds after the gesture, a machine when it is announced).
//
// Components only announce what is on screen (lib/sound.ts: playCue,
// announceMachine, useMachineSound); a page can also dispatch
// `sp:scene` {machine, active} and `sp:dialog` {speaker, text, kind, mood},
// and the /stroyka film tour sends its weather (`sp:nature`).

const GESTURES = ['pointerdown', 'keydown', 'touchend', 'click', 'scroll', 'wheel'] as const;
const FIELD =
  'input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea, select';

type Pick = { source: MachineSource; type: MachineType; at: number };

/** The opening film of /stroyka (StroykaFilm), which has its own soundtrack. */
const FILM_SELECTOR = '[data-testid="stroyka-film"]';

type AudioSessionType = 'auto' | 'playback' | 'play-and-record';

/**
 * Safari 17+: «playback» lets Web Audio play with the iPhone's silent switch
 * on; «play-and-record» while the chat microphone listens. Elsewhere a no-op.
 */
function setAudioSession(type: AudioSessionType) {
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (!session || !('type' in session) || session.type === type) return;
  try {
    session.type = type;
  } catch {
    /* not allowed now */
  }
}

export function SoundDirector() {
  useEffect(() => {
    const reduced = prefersReducedMotion();
    let ctx: AudioContext | null = null;
    let engine: SoundEngine | null = null;
    let loading: Promise<SoundEngine | null> | null = null;
    let listening = false;
    let typing = false;
    let disposed = false;
    let wasRunning = false;
    let introPoll = 0;
    let boomTimer = 0;
    // The chat microphone is open: the site's sound steps aside (onMic below).
    let micOn = false;
    // The opening film is on screen (watched below).
    let filmOn = !!document.querySelector(FILM_SELECTOR);
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
          engine.setFilm(filmOn);
          return engine;
        })
        .catch(() => null);
      return loading;
    };

    /** Everything that starts once the context runs: beds, machine, intro. */
    // Set once the nature listeners exist (below); applies the kept weather.
    let natureSync = () => {};
    const onRunning = () => {
      if (!engine || !live()) return;
      syncFilm();
      removeGestures();
      // Hides the «коснитесь — включится звук» hint of the opening titles.
      document.documentElement.setAttribute('data-sound-live', '');
      setAudioSession('playback');
      void engine.startBeds();
      // Timers paused by the mic, a hidden page or the switch start again.
      engine.resumeTimers();
      natureSync();
      playing = null;
      applyMachine(true);
      // Sound came on while the opening titles are up: the brass hit for the
      // partner card, and a whoosh as the camera dives in.
      if (introAtGesture && !wasRunning) {
        // The brass hit lands with the logo (1.75 s into the titles, which
        // start with the page); a later tap gets it at once.
        const hit = Math.max(0, 1750 - performance.now());
        window.clearTimeout(boomTimer);
        boomTimer = window.setTimeout(() => void engine?.cue('boom'), hit);
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
      if (disposed || micOn || !soundEnabled() || document.visibilityState !== 'visible') return;
      if (!ctx) {
        // No context before the visitor's first real gesture: the browser
        // would refuse to start it and warn in the console.
        if (!activated()) return;
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

    // The page has had a real gesture (sticky activation). Browsers without
    // the API reach wake() from gesture handlers only, so they pass.
    const activated = () => {
      const activation = (
        navigator as Navigator & { userActivation?: { isActive: boolean; hasBeenActive: boolean } }
      ).userActivation;
      return !activation || activation.isActive || activation.hasBeenActive;
    };

    const onGesture = (event: Event) => {
      // A press of «Выключить звук» is not a reason to start the sound first.
      const target = event.target as Element | null;
      if (target?.closest?.('[data-sound-toggle]')) return;
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
        window.clearTimeout(boomTimer);
        window.clearInterval(introPoll);
        setAudioSession('auto');
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
    // under reduced motion: there sound starts only from the switch itself
    // (which may have been pressed before this lazy chunk arrived).
    if (soundEnabled() || (!reduced && storedSoundChoice())) {
      // Before the store changes, so the switch listener does not wake now.
      wasOn = true;
      setSoundEnabled(true, false);
      addGestures();
      // The page was already touched (a client-side navigation): wake now.
      // Otherwise the context is created lazily on the first touch, so no
      // AudioContext exists before a gesture.
      const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } })
        .userActivation;
      if (activation?.hasBeenActive) wake();
    }

    const onVisibility = () => {
      if (!engine) return;
      if (document.visibilityState === 'hidden') {
        engine.hush();
        engine.pauseTimers();
        engine.suspend();
      } else if (soundEnabled() && !micOn) {
        void engine.resume().then((ok) => {
          if (ok) onRunning();
          else addGestures();
        });
      }
    };

    // The chat microphone: iOS hears nothing while the page plays audio.
    const onMic = (event: Event) => {
      micOn = (event as CustomEvent<boolean>).detail;
      if (micOn) setAudioSession('play-and-record');
      else setAudioSession(ctx && soundEnabled() ? 'playback' : 'auto');
      if (!engine) return;
      if (micOn) {
        engine.hush();
        engine.pauseTimers();
        engine.suspend();
      } else if (soundEnabled() && document.visibilityState === 'visible') {
        // The mic closes outside a gesture: if the browser refuses to resume
        // now, the next tap does it.
        void engine.resume().then((ok) => {
          if (ok) onRunning();
          else addGestures();
        });
      }
    };

    // The opening film: its soundtrack plays alone; the beds come back after.
    const syncFilm = () => {
      const on = !!document.querySelector(FILM_SELECTOR);
      if (on === filmOn) return;
      filmOn = on;
      engine?.setFilm(on);
      if (!on) natureSync();
    };
    // A light poll rather than a MutationObserver: /stroyka changes its DOM
    // all the time, so nothing is added to each change. The film exists only
    // on /stroyka.
    const filmPoll = window.setInterval(() => {
      if (filmOn || location.pathname.startsWith('/stroyka')) syncFilm();
    }, 400);

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

    // A page that shows a machine in a scene of its own (`sp:scene`).
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
      syncFilm();
      if (!live() || filmOn || !detail?.text) return;
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

    // Nature under the film tour: the latest state is kept, so an
    // engine that wakes later (the first tap) starts with the right weather.
    // The page may have sent it before this lazy chunk listened: start from it.
    let nature: NatureEventDetail | null = currentNature();
    const onNature = (event: Event) => {
      nature = (event as CustomEvent<NatureEventDetail | null>).detail;
      if (live()) engine!.setNature(nature);
    };
    natureSync = () => {
      if (!live()) return;
      engine!.setNature(nature);
    };
    window.addEventListener(NATURE_EVENT, onNature);

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener(MIC_EVENT, onMic);
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
      window.clearTimeout(boomTimer);
      window.clearInterval(filmPoll);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener(MIC_EVENT, onMic);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('click', onClick);
      window.removeEventListener('pageswap', whoosh);
      window.removeEventListener('sp:scene', onScene);
      window.removeEventListener('sp:dialog', onDialog);
      window.removeEventListener(NATURE_EVENT, onNature);
      setAudioSession('auto');
      if (engine) engine.dispose();
      else void ctx?.close().catch(() => {});
      engine = null;
      ctx = null;
    };
  }, []);

  return null;
}
