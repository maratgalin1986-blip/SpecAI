'use client';

import { useEffect, useState, type ReactNode } from 'react';

// Background footage done the fast way. The server renders the clip's poster
// frame as a plain image, so the first paint does not wait for any script;
// after hydration the video is mounted over it and fades in once it plays.
// Only the clip actually shown is downloaded (the page may pick another one
// after hydration), and there is no video at all with reduced motion, with
// data saver on or on a 2G connection — the poster frame stays. Phones and 3G
// get the light cut (<clip>-sm.mp4: 360p, ~0.3–0.45 Mbit/s, about 2.3 times
// lighter than the full clip).

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

/** The <source> list of a clip: the light mp4 alone, or webm with an mp4 fallback. */
export function clipSources(clip: string, light: boolean): ReactNode {
  return light ? (
    <source src={`/video/${clip}-sm.mp4`} type="video/mp4" />
  ) : (
    <>
      <source src={`/video/${clip}.webm`} type="video/webm" />
      <source src={`/video/${clip}.mp4`} type="video/mp4" />
    </>
  );
}

export function CinemaVideo({
  clip,
  poster = clip,
  className = '',
  priority = false,
}: {
  /** Name in public/video (…/<clip>.webp|.webm|.mp4). */
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

  useEffect(() => {
    setLight(lightFootage());
    setAllowed(footageAllowed());
  }, []);

  return (
    <>
      <img
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
          className={`object-cover transition-opacity duration-700 ${
            playing === clip ? 'opacity-100' : 'opacity-0'
          } ${className}`}
          autoPlay
          muted
          loop
          playsInline
          aria-hidden
          onPlaying={() => setPlaying(clip)}
        >
          {clipSources(clip, light)}
        </video>
      )}
    </>
  );
}
