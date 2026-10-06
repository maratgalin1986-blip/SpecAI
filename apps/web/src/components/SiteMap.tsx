import { formatCoords, tilesAround, TILE_SIZE } from '@/lib/geo';

// «Вид с квадрокоптера» on the work site: OpenStreetMap tiles around the
// point at street level (houses and numbers are visible at zoom 17–18), a
// crosshair and a pulsing marker, and the coordinates for a navigator. Plain
// images — no map library, nothing to hydrate.

export function SiteMap({
  lat,
  lon,
  label,
  zoom = 17,
  caption = 'Место работ',
}: {
  lat: number;
  lon: number;
  label: string;
  zoom?: number;
  caption?: string;
}) {
  const tiles = tilesAround(lat, lon, zoom);

  return (
    <figure className="site-map relative overflow-hidden rounded-3xl bg-slate-900 text-white ring-1 ring-white/10">
      <div className="relative aspect-[4/3] overflow-hidden sm:aspect-[16/9]">
        <div className="map-descent absolute inset-0">
          <div className="absolute left-1/2 top-1/2">
            {tiles.map((tile) => (
              <img
                key={tile.key}
                src={tile.src}
                alt=""
                width={TILE_SIZE}
                height={TILE_SIZE}
                loading="lazy"
                decoding="async"
                draggable={false}
                className="absolute max-w-none select-none"
                style={{ left: tile.left, top: tile.top }}
              />
            ))}
          </div>
        </div>

        {/* Camera overlay */}
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(2,6,23,0.65)_100%)]"
          aria-hidden
        />
        <div
          className="journey-scanlines pointer-events-none absolute inset-0 opacity-25"
          aria-hidden
        />
        <div className="hud-corners pointer-events-none absolute inset-3" aria-hidden />
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <span className="absolute left-1/2 top-0 h-full w-px bg-white/15" />
          <span className="absolute left-0 top-1/2 h-px w-full bg-white/15" />
          <span className="map-ping absolute left-1/2 top-1/2 h-10 w-10 rounded-full border-2 border-amber-400" />
          <span className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-400 shadow-[0_0_0_4px_rgba(2,6,23,0.6),0_0_24px_rgba(245,158,11,0.9)]" />
        </div>

        <div className="absolute left-5 top-4 flex items-center gap-2 rounded bg-slate-950/70 px-2 py-1 font-mono text-[0.6rem] uppercase tracking-[0.2em] text-white/80 backdrop-blur">
          <span className="journey-rec h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden />
          Вид с квадрокоптера
        </div>
        <a
          href="/credits"
          className="absolute bottom-2 right-3 rounded bg-white/80 px-1.5 text-[0.6rem] text-slate-700"
        >
          © участники OpenStreetMap
        </a>
      </div>

      <figcaption className="flex flex-wrap items-end justify-between gap-3 p-5">
        <div className="min-w-0">
          <div className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-amber-400">
            {caption}
          </div>
          <div className="mt-1 font-semibold">{label}</div>
          <div className="mt-0.5 font-mono text-xs text-white/50">{formatCoords(lat, lon)}</div>
        </div>
        {/* No outbound links (owner's rule): the coordinates go into any navigator. */}
        <p className="max-w-xs text-xs text-white/60">
          Координаты можно вставить в любой навигатор — машинист приедет по ним.
        </p>
      </figcaption>
    </figure>
  );
}
