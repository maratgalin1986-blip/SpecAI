'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { IsoKind, IsoModel } from '@/lib/design/iso';
import { fitView, project } from '@/lib/smeta3d';

// The wireframe 3D of a design, drawn like the 3D of the estimate: thin
// cyan lines on a dark blueprint, no faces. A slider turns the model; there
// is no autoplay, so reduced motion is respected by design.

const STYLE: Record<IsoKind, { stroke: string; width: number; dash?: string; opacity?: number }> = {
  wall: { stroke: '#eaf8ff', width: 1.1 },
  roof: { stroke: '#5ee0ff', width: 1 },
  floor: { stroke: '#5ee0ff', width: 0.6, opacity: 0.55 },
  open: { stroke: '#fbbf24', width: 0.8 },
  ground: { stroke: '#5ee0ff', width: 0.5, dash: '3 4', opacity: 0.6 },
  tree: { stroke: '#86efac', width: 0.8 },
  zone: { stroke: '#5ee0ff', width: 0.7, opacity: 0.8 },
};
const ORDER: IsoKind[] = ['ground', 'zone', 'floor', 'wall', 'open', 'roof', 'tree'];
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

export function IsoView({ model, title }: { model: IsoModel; title: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(360);
  const [yaw, setYaw] = useState(-0.65);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(260, Math.round(el.clientWidth)));
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);
  const height = Math.round(Math.min(460, Math.max(240, width * 0.62)));
  const paths = useMemo(() => {
    const view = fitView(
      { L: model.L, W: model.W, depth: 0, height: model.height, margin: 1.5 },
      width,
      height - 24,
      yaw,
    );
    const byKind = new Map<IsoKind, string[]>();
    for (const ln of model.lines) {
      const [ax, ay] = project(ln.a, view);
      const [bx, by] = project(ln.b, view);
      const list = byKind.get(ln.kind) ?? [];
      list.push(`M${ax.toFixed(1)} ${ay.toFixed(1)}L${bx.toFixed(1)} ${by.toFixed(1)}`);
      byKind.set(ln.kind, list);
    }
    return ORDER.filter((k) => byKind.has(k)).map((k) => ({ kind: k, d: byKind.get(k)!.join('') }));
  }, [model, width, height, yaw]);
  return (
    <div ref={wrap} className="overflow-hidden rounded-xl border border-cyan-900 bg-[#0a1a2f]">
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`3D-схема: ${title}`}
      >
        <defs>
          <pattern id="dz-grid" width={24} height={24} patternUnits="userSpaceOnUse">
            <path d="M24 0H0V24" fill="none" stroke="#123456" strokeWidth={0.6} />
          </pattern>
        </defs>
        <rect width={width} height={height} fill="url(#dz-grid)" />
        {paths.map((p) => {
          const s = STYLE[p.kind];
          return (
            <path
              key={p.kind}
              d={p.d}
              fill="none"
              stroke={s.stroke}
              strokeWidth={s.width}
              strokeDasharray={s.dash}
              opacity={s.opacity}
              strokeLinecap="round"
            />
          );
        })}
        <text x={10} y={height - 10} fill="#5ee0ff" fontFamily={MONO} fontSize={11}>
          3D · {title}
        </text>
      </svg>
      <label className="flex items-center gap-3 border-t border-cyan-900 px-3 py-2 text-xs text-cyan-200">
        <span className="shrink-0">Повернуть</span>
        <input
          type="range"
          min={-314}
          max={314}
          value={Math.round(yaw * 100)}
          onChange={(e) => setYaw(Number(e.target.value) / 100)}
          className="min-w-0 flex-1 accent-cyan-400"
          aria-label="Повернуть 3D-схему"
        />
      </label>
    </div>
  );
}
