'use client';

import Image from 'next/image';
import { useEffect, useState, type CSSProperties } from 'react';
import { defaultPhotoOf, pickPhoto, type MachineType } from '@/lib/machinePhotos';

/**
 * The photo to show for a machine type: `base` is the server-rendered first
 * variant; `picked` is a random other variant chosen after mount (null until
 * then, or when the pick is the base itself). Keeps hydration stable.
 */
export function useMachinePhoto(type: MachineType, slot = '') {
  const base = defaultPhotoOf(type);
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    const pick = pickPhoto(type, slot);
    setPicked(pick === base ? null : pick);
  }, [type, slot, base]);

  return { base, picked };
}

// A machine photo filling its (positioned) parent. The server renders variant
// 1; after mount a random different variant cross-fades in. Images below the
// fold that have not loaded yet skip variant 1 entirely.
export function MachinePhoto({
  type,
  slot = '',
  alt = '',
  sizes = '100vw',
  priority = false,
  className = 'absolute inset-0',
  imgClassName = '',
  style,
}: {
  type: MachineType;
  /** Where on the site this photo sits, so each place varies on its own. */
  slot?: string;
  alt?: string;
  sizes?: string;
  priority?: boolean;
  /** Classes of the wrapper (default: fills the parent). */
  className?: string;
  /** Classes of each <img>, e.g. an animation. */
  imgClassName?: string;
  /** Style of the wrapper, e.g. scroll-driven opacity or transform. */
  style?: CSSProperties;
}) {
  const photo = useMachinePhoto(type, slot);
  const { base } = photo;
  const [failed, setFailed] = useState(false);
  const picked = failed ? null : photo.picked;
  const [baseLoaded, setBaseLoaded] = useState(false);
  const [pickedLoaded, setPickedLoaded] = useState(false);
  const showBase = !picked || baseLoaded || priority;

  return (
    <div className={className} style={style}>
      {showBase && (
        <Image
          src={base}
          alt={picked && pickedLoaded ? '' : alt}
          fill
          sizes={sizes}
          priority={priority}
          onLoad={() => setBaseLoaded(true)}
          className={`object-cover ${imgClassName}`}
        />
      )}
      {picked && (
        <Image
          key={picked}
          src={picked}
          alt={alt}
          fill
          sizes={sizes}
          onLoad={() => setPickedLoaded(true)}
          onError={() => setFailed(true)}
          className={`object-cover ${imgClassName}`}
          style={{ opacity: pickedLoaded ? 1 : 0, transition: 'opacity 700ms ease' }}
        />
      )}
    </div>
  );
}
