'use client';

import { useEffect, useRef, useState } from 'react';
import { footageAllowed, lightFootage } from '@/components/CinemaVideo';
import { watchInView } from '@/lib/inView';
import { loopPoster, loopSrc, type LoopName } from '@/lib/loops';

// A short muted loop from public/loops over its poster frame (lib/loops.ts).
// - The server renders the poster only; the <video> is created after
//   hydration, with preload="none", once the frame is near the viewport.
// - It plays only while on screen and pauses off screen.
// - No video at all with reduced motion, data saver or 2G (footageAllowed):
//   the poster stays.
// - Phones get the 480p cut; and when the page already has another video
//   (a hero clip), a phone waits for the visitor's first touch before
//   starting this one, so two decoders don't start on a cold page.
// - `active={false}` (a step not shown yet) keeps it parked on its poster.

const FIRST_INPUT = ['pointerdown', 'touchstart', 'keydown'] as const;
let touched = false;
const waiting = new Set<() => void>();

function afterFirstInput(callback: () => void): () => void {
  if (touched) {
    callback();
    return () => {};
  }
  if (waiting.size === 0) {
    const opts = { passive: true, capture: true } as const;
    const fire = () => {
      touched = true;
      FIRST_INPUT.forEach((type) => window.removeEventListener(type, fire, opts));
      const callbacks = [...waiting];
      waiting.clear();
      callbacks.forEach((cb) => cb());
    };
    FIRST_INPUT.forEach((type) => window.addEventListener(type, fire, opts));
  }
  waiting.add(callback);
  return () => waiting.delete(callback);
}

function isPhone() {
  return lightFootage() || window.matchMedia('(pointer: coarse)').matches;
}

export function LoopVideo({
  clip,
  className = '',
  active = true,
  alt = '',
}: {
  clip: LoopName;
  /** Classes of both the poster and the video (position, size, object-position). */
  className?: string;
  /** Whether this loop may play now (e.g. the current step). */
  active?: boolean;
  /** Text for screen readers; empty = decorative. */
  alt?: string;
}) {
  const posterRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [allowed, setAllowed] = useState(false);
  const [light, setLight] = useState(false);
  const [near, setNear] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [playing, setPlaying] = useState(false);

  // Decide once after hydration; on a phone with another video playing on
  // the page, wait for the first touch.
  useEffect(() => {
    if (!footageAllowed()) return;
    setLight(lightFootage());
    // CinemaVideo mounts its clip late (after load and idle), so its poster
    // frame (an <img> from public/video) counts as «another video» too.
    const otherVideo = document.querySelector('video:not([data-loop]), img[src^="/video/"]');
    if (isPhone() && otherVideo) return afterFirstInput(() => setAllowed(true));
    setAllowed(true);
  }, []);

  useEffect(() => {
    const el = posterRef.current;
    if (!allowed || !el) return;
    return watchInView(el, (entry) => setNear(entry.isIntersecting), { rootMargin: '25% 0px' });
  }, [allowed]);

  useEffect(() => {
    if (allowed && near && active) setMounted(true);
  }, [allowed, near, active]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (near && active) video.play().catch(() => {});
    else video.pause();
  }, [near, active, mounted]);

  return (
    <>
      <img
        ref={posterRef}
        src={loopPoster(clip)}
        alt={alt}
        aria-hidden={alt ? undefined : true}
        loading="lazy"
        decoding="async"
        className={`object-cover ${className}`}
      />
      {mounted && (
        <video
          ref={videoRef}
          data-loop=""
          data-playing={playing ? '' : undefined}
          className={`loop-video object-cover ${className}`}
          src={loopSrc(clip, light)}
          muted
          loop
          playsInline
          preload="none"
          aria-hidden
          onPlaying={() => setPlaying(true)}
        />
      )}
    </>
  );
}
