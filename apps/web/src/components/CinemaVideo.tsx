'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

// Background footage done the fast way. The server renders the clip's poster
// frame as a plain image, so the first paint does not wait for any script;
// after hydration the video is mounted over it and fades in once it plays.
// Only the clip actually shown is downloaded (the page may pick another one
// after hydration), and there is no video at all with reduced motion, with
// data saver on or on a 2G connection — the poster frame stays. Phones and 3G
// get the light cut (<clip>-sm.mp4: 720p, ~1–1.5 Mbit/s); desktops get
// <clip>-md.mp4 (1080p from the original Mixkit masters, ≤3.5 Mbit/s). The
// scroll-scrubbed journey uses <clip>.mp4 (720p, a keyframe every second).
// H.264 only: every browser plays it, and a second webm copy of each clip
// doubled the weight for little gain.
//
// The poster stays the page's LCP element: the video element is created only
// after the page has loaded and gone idle, with preload="none", and starts
// downloading only when it is within a screen of the viewport.

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

/**
 * The <source> list of a clip: the light mp4 alone, the desktop background
 * cut alone, or (for scrubbing) webm with an mp4 fallback.
 */
export function clipSources(clip: string, light: boolean, background = false): ReactNode {
  if (light) return <source src={`/video/${clip}-sm.mp4`} type="video/mp4" />;
  return background ? (
    <source src={`/video/${clip}-md.mp4`} type="video/mp4" />
  ) : (
    <source src={`/video/${clip}.mp4`} type="video/mp4" />
  );
}

export function CinemaVideo({
  clip,
  poster = clip,
  className = '',
  priority = false,
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
}) {
  const [allowed, setAllowed] = useState(false);
  const [light, setLight] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const [near, setNear] = useState(false);
  const posterRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // After load and idle: nothing competes with the poster and the scripts.
  useEffect(() => {
    if (!footageAllowed()) return;
    let idle = 0;
    let timer = 0;
    const start = () => {
      const w = window as Window & {
        requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      };
      const go = () => {
        setLight(lightFootage());
        setAllowed(true);
      };
      if (w.requestIdleCallback) idle = w.requestIdleCallback(go, { timeout: 2500 });
      else timer = window.setTimeout(go, 300);
    };
    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start, { once: true });
    return () => {
      window.removeEventListener('load', start);
      const w = window as Window & { cancelIdleCallback?: (id: number) => void };
      if (idle) w.cancelIdleCallback?.(idle);
      window.clearTimeout(timer);
    };
  }, []);

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
          key={`${clip}${light ? '-sm' : ''}`}
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
          {clipSources(clip, light, true)}
        </video>
      )}
    </>
  );
}
