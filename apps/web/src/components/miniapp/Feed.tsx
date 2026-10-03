'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { footageAllowed } from '@/components/CinemaVideo';
import { MACHINE_LABELS, type MachineType } from '@/lib/machinePhotos';
import { feedItems, priceLine, type FeedItem } from '@/lib/miniApp';

// «Наши работы»: a vertical feed of full-height cards, one per screen, like
// Stories. A clip plays only while its card is on screen (muted, looped);
// with reduced motion, data saver or 2G only the poster frame is shown.

const ITEMS = feedItems();

function useOnScreen(ref: RefObject<HTMLElement | null>, root: RefObject<HTMLElement | null>) {
  const [onScreen, setOnScreen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setOnScreen(Boolean(entry?.isIntersecting)),
      { root: root.current, threshold: 0.6 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, root]);
  return onScreen;
}

function Clip({ clip, playing }: { clip: string; playing: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [allowed, setAllowed] = useState(false);
  useEffect(() => setAllowed(footageAllowed()), []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (playing) {
      video.muted = true;
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [playing, allowed]);

  const poster = `/video/${clip}.webp`;
  return (
    <>
      <img
        src={poster}
        alt=""
        aria-hidden
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
      />
      {allowed && (
        <video
          ref={videoRef}
          muted
          playsInline
          loop
          preload="none"
          poster={poster}
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
        >
          <source src={`/video/${clip}-sm.mp4`} type="video/mp4" />
        </video>
      )}
    </>
  );
}

function Card({
  item,
  index,
  root,
  onOrder,
}: {
  item: FeedItem;
  index: number;
  root: RefObject<HTMLElement | null>;
  onOrder: (type?: MachineType) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const onScreen = useOnScreen(ref, root);
  const type = item.type;
  const machine = item.kind === 'video' ? MACHINE_LABELS[item.type] : item.machine;
  const title = item.kind === 'video' ? item.work : item.caption;
  const price = type ? priceLine(type) : null;

  return (
    <article
      ref={ref}
      aria-label={`${index + 1} из ${ITEMS.length}: ${title}`}
      className="relative h-full w-full shrink-0 snap-start snap-always overflow-hidden bg-slate-900"
    >
      {item.kind === 'video' ? (
        <Clip clip={item.clip} playing={onScreen} />
      ) : (
        <img
          src={item.src}
          alt={item.caption}
          loading={index === 0 ? 'eager' : 'lazy'}
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/50 via-transparent to-slate-950/95" />
      <span className="absolute left-4 top-4 rounded-full bg-slate-950/70 px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-amber-300 backdrop-blur">
        {item.kind === 'photo' ? 'Фото с объекта' : 'Пример работ'}
      </span>
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <h2 className="text-2xl font-bold leading-tight text-white drop-shadow">{title}</h2>
        {machine && (
          <p className="text-sm text-slate-200">
            {machine} с машинистом
            {price && <span className="text-amber-300"> · {price.hour}</span>}
          </p>
        )}
        <button
          type="button"
          onClick={() => onOrder(type)}
          className="mt-1 rounded-xl bg-amber-500 px-5 py-3 text-base font-semibold text-slate-950 shadow-lg shadow-amber-600/30 active:bg-amber-400"
        >
          Заказать такую технику
        </button>
        {index === 0 && ITEMS.length > 1 && (
          <p className="text-center text-xs text-slate-400" aria-hidden>
            Листайте вверх ↑
          </p>
        )}
      </div>
    </article>
  );
}

export function Feed({ onOrder }: { onOrder: (type?: MachineType) => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={rootRef}
      className="h-full snap-y snap-mandatory overflow-y-auto overscroll-contain"
      aria-label="Наши работы"
    >
      {ITEMS.map((item, index) => (
        <Card key={item.id} item={item} index={index} root={rootRef} onOrder={onOrder} />
      ))}
    </div>
  );
}
