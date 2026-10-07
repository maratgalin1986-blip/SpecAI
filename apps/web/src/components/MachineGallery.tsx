'use client';

import { useState } from 'react';

// Photo gallery with a large main image and clickable thumbnails.
// `owner` names whose machine it is in the alt text, for our own photos only.
export function MachineGallery({
  images,
  name,
  owner,
}: {
  images: string[];
  name: string;
  owner?: string;
}) {
  const [current, setCurrent] = useState(0);
  const main = images[current] ?? images[0];

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-slate-950 sm:aspect-[16/10]">
        {main && (
          <img
            key={main}
            src={main}
            alt={`${name}${owner ? ` — техника ${owner}` : ''} — фото ${current + 1}`}
            className="cine-cut h-full w-full object-cover"
          />
        )}
        {images.length > 1 && (
          <span className="absolute bottom-3 right-3 rounded-full bg-slate-950/70 px-2.5 py-1 font-mono text-xs text-white backdrop-blur">
            {current + 1} / {images.length}
          </span>
        )}
      </div>
      {images.length > 1 && (
        <div className="grid grid-cols-5 gap-2 sm:grid-cols-6">
          {images.map((url, index) => (
            <button
              key={url}
              type="button"
              onClick={() => setCurrent(index)}
              aria-label={`Показать фото ${index + 1}`}
              aria-pressed={index === current}
              className={`aspect-[4/3] overflow-hidden rounded-xl ring-2 transition ${
                index === current ? 'ring-amber-500' : 'ring-transparent hover:ring-slate-300'
              }`}
            >
              <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
