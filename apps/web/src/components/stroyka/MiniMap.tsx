'use client';

import { useEffect, useRef } from 'react';
import { BUILDING, FENCE, PIT, ZONES, type ZoneId } from '@/lib/stroyka';

// GTA-style mini-map in world coordinates (north up), with the player arrow.
export interface MiniCity {
  /** SVG `points` of building footprints around the site (scene coordinates). */
  polys: string[];
  roads: string[];
}

export function SiteMapSvg({
  active,
  onZone,
  arrowRef,
  big = false,
  city,
}: {
  active: ZoneId | null;
  onZone?: (zone: ZoneId) => void;
  arrowRef?: React.Ref<SVGGElement>;
  big?: boolean;
  city?: MiniCity | null;
}) {
  const pad = city ? 16 : big ? 6 : 4;
  return (
    <svg
      viewBox={`${FENCE.minX - pad} ${FENCE.minZ - pad} ${FENCE.maxX - FENCE.minX + pad * 2} ${FENCE.maxZ - FENCE.minZ + pad * 2 + (big ? 12 : 6)}`}
      className="h-full w-full"
      role={onZone ? 'group' : 'img'}
      aria-label="Карта стройки"
    >
      <rect x={FENCE.minX - pad} y={FENCE.minZ - pad} width="999" height="999" fill="#3f5a2a" />
      {city?.roads.map((points, i) => (
        <polyline key={`r${i}`} points={points} fill="none" stroke="#475569" strokeWidth="5" />
      ))}
      {city?.polys.map((points, i) => (
        <polygon key={`b${i}`} points={points} fill="#94a3b8" stroke="#334155" strokeWidth="0.5" />
      ))}
      <rect
        x={FENCE.minX}
        y={FENCE.minZ}
        width={FENCE.maxX - FENCE.minX}
        height={FENCE.maxZ - FENCE.minZ}
        fill="#9a7a52"
        stroke="#1f2937"
        strokeWidth={big ? 1.2 : 2}
      />
      <rect x={-5} y={-16} width={10} height={FENCE.maxZ + 30} fill="#7d7a74" />
      <rect x={FENCE.minX - 20} y={-19} width={FENCE.maxX + 25} height={10} fill="#7d7a74" />
      <rect
        x={PIT.minX}
        y={PIT.minZ}
        width={PIT.maxX - PIT.minX}
        height={PIT.maxZ - PIT.minZ}
        fill="#5e4129"
      />
      <rect
        x={BUILDING.minX}
        y={BUILDING.minZ}
        width={BUILDING.maxX - BUILDING.minX}
        height={BUILDING.maxZ - BUILDING.minZ}
        fill="#b4aea6"
        stroke="#111827"
        strokeWidth="0.8"
      />
      {ZONES.map((zone) => {
        const on = zone.id === active;
        const r = big ? 6.5 : 5;
        const marker = (
          <g key={zone.id} transform={`translate(${zone.center[0]} ${zone.center[1]})`}>
            <circle
              r={r}
              fill={on ? '#f59e0b' : '#111827'}
              fillOpacity={on ? 1 : 0.75}
              stroke="#fbbf24"
              strokeWidth={big ? 1 : 1.5}
            />
            <text
              y={big ? 2.4 : 2}
              textAnchor="middle"
              fontSize={big ? 6.5 : 6}
              fontWeight="700"
              fill={on ? '#111827' : '#fbbf24'}
            >
              {zone.name.charAt(0)}
            </text>
            {big && (
              <text y={r + 7} textAnchor="middle" fontSize="6" fontWeight="700" fill="#f8fafc">
                {zone.name}
              </text>
            )}
          </g>
        );
        return onZone ? (
          <a
            key={zone.id}
            href={`#zone-${zone.id}`}
            aria-label={`Зона: ${zone.name}`}
            onClick={(e) => {
              e.preventDefault();
              onZone(zone.id);
            }}
            className="cursor-pointer"
          >
            {marker}
          </a>
        ) : (
          marker
        );
      })}
      {arrowRef && (
        <g ref={arrowRef}>
          <polygon
            points="0,7 -4.5,-4 0,-1.5 4.5,-4"
            fill="#f8fafc"
            stroke="#111827"
            strokeWidth="1"
          />
        </g>
      )}
    </svg>
  );
}

export function MiniMap({
  telemetry,
  active,
  city,
}: {
  telemetry: { x: number; z: number; yaw: number };
  active: ZoneId | null;
  city?: MiniCity | null;
}) {
  const arrow = useRef<SVGGElement>(null);
  useEffect(() => {
    const timer = window.setInterval(() => {
      const deg = (-telemetry.yaw * 180) / Math.PI;
      arrow.current?.setAttribute(
        'transform',
        `translate(${telemetry.x.toFixed(1)} ${telemetry.z.toFixed(1)}) rotate(${deg.toFixed(0)})`,
      );
    }, 120);
    return () => window.clearInterval(timer);
  }, [telemetry]);
  return (
    <div
      data-testid="minimap"
      className="h-28 w-24 overflow-hidden rounded-xl border-2 border-amber-400/80 bg-slate-900 shadow-lg sm:h-36 sm:w-32"
    >
      <SiteMapSvg active={active} arrowRef={arrow} city={city} />
    </div>
  );
}
