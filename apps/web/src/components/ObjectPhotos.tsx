import { OBJECT_PHOTOS } from '@/lib/objectPhotos';
import { SITE } from '@/lib/site';

// «Фото с объектов»: real photos from clients and executors. Hidden until the
// first approved photo is added to lib/objectPhotos.ts.
export function ObjectPhotos() {
  if (!OBJECT_PHOTOS.length) return null;
  return (
    <section className="flex flex-col gap-5">
      <div>
        <div className="eyebrow text-amber-700">Наши объекты</div>
        <h2 className="mt-2 text-3xl font-extrabold tracking-tight">Фото с объектов</h2>
        <p className="mt-2 text-slate-600">Снимали наши клиенты и машинисты — спасибо им!</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {OBJECT_PHOTOS.map((photo) => (
          <figure key={photo.src} className="overflow-hidden rounded-2xl bg-slate-100">
            <img
              src={photo.src}
              alt={`${photo.caption} — объект ${SITE.name}`}
              loading="lazy"
              className="aspect-[4/3] w-full object-cover"
            />
            <figcaption className="p-2 text-xs text-slate-600">
              {photo.stage === 'before' ? 'До · ' : photo.stage === 'after' ? 'После · ' : ''}
              {photo.machine ? `${photo.machine} · ` : ''}
              {photo.caption}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
