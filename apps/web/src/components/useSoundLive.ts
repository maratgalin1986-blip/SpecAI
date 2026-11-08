'use client';

import { useEffect, useState } from 'react';

/**
 * Whether the site's sound is actually playing (SoundDirector sets
 * `data-sound-live` on <html> once the audio runs). Browsers start sound only
 * with the visitor's first touch, so until then a sound button says «Включить
 * звук» and its press is the touch that starts it — not a switch-off.
 */
export function useSoundLive(): boolean {
  const [live, setLive] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setLive(root.hasAttribute('data-sound-live'));
    read();
    const watch = new MutationObserver(read);
    watch.observe(root, { attributes: true, attributeFilter: ['data-sound-live'] });
    return () => watch.disconnect();
  }, []);
  return live;
}
