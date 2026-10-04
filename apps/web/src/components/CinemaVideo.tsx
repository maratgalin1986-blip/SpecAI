'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { onIdle, whenIntroGone } from '@/lib/cinemaFx';

// Background footage done the fast way. The server renders the clip's poster
// frame as a plain image, so the first paint does not wait for any script;
// after hydration the video is mounted over it and fades in once it plays.
// Only the clip actually shown is downloaded (the page may pick another one
// after hydration), and there is no video at all with reduced motion, with
// data saver on or on a 2G connection — the poster frame stays. Phones and 3G
// get the light cut (<clip>-sm.mp4: 720p, ~1–1.5 Mbit/s); desktops get
// <clip>-md.mp4 (1080p from the original Mixkit masters, ≤3.5 Mbit/s), or
// <clip>.mp4 (720p) when the frame is no wider than about 1400 device pixels,
// where 1080p would only be scaled down. The scroll-scrubbed journey uses
// <clip>.mp4 (720p, a keyframe every second).
// H.264 only: every browser plays it, and a second webm copy of each clip
// doubled the weight for little gain.
//
// The poster stays the page's LCP element: the video element is created only
// after the page has loaded and gone idle, with preload="none", and starts
// downloading only when it is within a screen of the viewport. A `deferred`
// clip (the home hero) also waits until the opening titles are gone (nothing
// is decoded under them), and on phones until the first touch or a few idle
// seconds later; its poster frame shows until then.

type Connection = { saveData?: boolean; effectiveType?: string };

/** Whether this visitor should get background video. */
export function footageAllowed() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  const connection = (navigator as Navigator & { connection?: Connection }).connection;
  return !(connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType ?? ''));
}

/** Whether to play the light cut: a narrow screen or a slow (3G) connection. */
export function lightFootage() {
  const connection = (navigator as Navigator & { connection?: Connection }).connection;
  return (
    window.matchMedia('(max-width: 640px)').matches ||
    connection?.effectiveType === '3g' ||
    !!connection?.saveData
  );
}

/** Device pixels up to which the 720p cut is as sharp as the 1080p one. */
const HD_FROM = 1400;

/**
 * Whether a full-bleed (object-cover, 16:9) clip in `el` needs the 1080p cut:
 * its covered width in device pixels.
 */
export function needsFullHd(el: HTMLElement | null): boolean {
  // Layout size: a push-in or parallax transform on the frame does not count.
  const width = el?.offsetWidth
    ? Math.max(el.offsetWidth, (el.offsetHeight * 16) / 9)
    : window.innerWidth;
  return width * Math.min(2, window.devicePixelRatio || 1) > HD_FROM;
}

/**
 * The <source> list of a clip: the light mp4 alone, the desktop background
 * cut alone (1080p, or 720p for a small frame), or the scrubbing cut.
 */
export function clipSources(
  clip: string,
  light: boolean,
  background = false,
  fullHd = true,
): ReactNode {
  if (light) return <source src={`/video/${clip}-sm.mp4`} type="video/mp4" />;
  return background && fullHd ? (
    <source src={`/video/${clip}-md.mp4`} type="video/mp4" />
  ) : (
    <source src={`/video/${clip}.mp4`} type="video/mp4" />
  );
}

const FIRST_INPUT = ['pointerdown', 'touchstart', 'keydown'] as const;
/** Phones start a deferred clip this long after the titles, if not touched. */
const PHONE_IDLE_MS = 2500;

export function CinemaVideo({
  clip,
  poster = clip,
  className = '',
  priority = false,
  deferred = false,
}: {
  /** Name in public/video (…/<clip>.webp|.mp4). */
  clip: string;
  /**
   * Clip whose frame the server renders. Keep it the same on the server and
   * after hydration: if a page then picks another clip, only the video
   * changes and fades in over this frame, so the first paint stays early.
   */
  poster?: string;
  /** Classes of both the poster and the video, e.g. position and a push-in. */
  className?: string;
  /** Load the poster first (the page's main picture). */
  priority?: boolean;
  /** Wait for the opening titles to go, and on phones for a touch or idle. */
  deferred?: boolean;
}) {
  const [allowed, setAllowed] = useState(false);
  const [light, setLight] = useState(false);
  const [fullHd, setFullHd] = useState(true);
  const [playing, setPlaying] = useState<string | null>(null);
  const [near, setNear] = useState(false);
  const posterRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // After load and idle: nothing competes with the poster and the scripts.
  useEffect(() => {
    if (!footageAllowed()) return;
    const cancels: Array<() => void> = [];
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      cancels.forEach((cancel) => cancel());
      setLight(lightFootage());
      setFullHd(needsFullHd(posterRef.current));
      setAllowed(true);
    };
    const whenIdle = () => {
      cancels.push(onIdle(go, 2500));
    };
    const start = () => {
      if (!deferred) {
        whenIdle();
        return;
      }
      cancels.push(
        whenIntroGone(() => {
          const phone = lightFootage() || window.matchMedia('(pointer: coarse)').matches;
          if (!phone) {
            whenIdle();
            return;
          }
          // Phones: the first touch, or a few idle seconds later.
          const opts = { passive: true, capture: true } as const;
          FIRST_INPUT.forEach((type) => window.addEventListener(type, go, opts));
          const timer = window.setTimeout(whenIdle, PHONE_IDLE_MS);
          cancels.push(() => {
            FIRST_INPUT.forEach((type) => window.removeEventListener(type, go, opts));
            window.clearTimeout(timer);
          });
        }),
      );
    };
    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start, { once: true });
    return () => {
      done = true;
      window.removeEventListener('load', start);
      cancels.forEach((cancel) => cancel());
    };
  }, [deferred]);

  // Download and play only within a screen of the viewport; pause off screen.
  useEffect(() => {
    const el = posterRef.current;
    if (!allowed || !el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setNear(!!entry?.isIntersecting), {
      rootMargin: '100% 0px',
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [allowed]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (near) video.play().catch(() => {});
    else video.pause();
  }, [near, allowed, clip, light]);

  return (
    <>
      <img
        ref={posterRef}
        src={`/video/${poster}.webp`}
        alt=""
        aria-hidden
        // The main picture of the page is decoded right away so it is part of
        // the first paint; others may wait.
        decoding={priority ? 'sync' : 'async'}
        fetchPriority={priority ? 'high' : 'auto'}
        className={`object-cover ${className}`}
      />
      {allowed && (
        <video
          key={`${clip}${light ? '-sm' : fullHd ? '' : '-720'}`}
          ref={videoRef}
          className={`object-cover transition-opacity duration-700 ${
            playing === clip ? 'opacity-100' : 'opacity-0'
          } ${className}`}
          muted
          loop
          playsInline
          preload="none"
          aria-hidden
          onPlaying={() => setPlaying(clip)}
        >
          {clipSources(clip, light, true, fullHd)}
        </video>
      )}
    </>
  );
}
