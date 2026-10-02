import { useId } from 'react';
import type { LandZoneKind, Landscape } from '@/lib/design/types';
import { Dim, FONT, INK, m2, NorthArrow, PAPER, TitleBlock } from '@/components/design/PlanParts';

// Zoning plan of a plot: light tints and hatches by zone, beds, trees,
// gate and wicket on the street side, overall dimensions, north arrow and
// the title block.

export const ZONE_FILL: Record<LandZoneKind, string> = {
  house: '#e2e8f0',
  terrace: '#f3e2c7',
  driveway: '#d6d3d1',
  parking: '#d6d3d1',
  path: '#e7e5e4',
  beds: '#ead9c3',
  playground: '#fde9b0',
  bbq: '#e7e5e4',
  flowers: '#f9d4dc',
  garden: '#dcefd2',
  lawn: '#e9f5e1',
};

export function LandscapePlanSvg({
  land,
  title = '',
  code = '',
  styleTitle = '',
  compact = false,
  className,
}: {
  land: Landscape;
  title?: string;
  code?: string;
  styleTitle?: string;
  compact?: boolean;
  className?: string;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const { W, L } = land;
  const fs = Math.min(1.1, Math.max(0.45, Math.max(W, L) / 40));
  const sw = fs * 0.1;
  const pad = compact ? 0.5 : fs * 5;
  const oy = compact ? 0.5 : fs * 5;
  const sheetW = compact ? W + 1 : W + 2 * pad;
  const tbH = fs * 6;
  const sheetH = compact ? L + 1 : oy + L + fs * 3 + tbH + fs;
  const hatch = `h${id}`;
  const tiles = `t${id}`;
  return (
    <svg
      viewBox={`0 0 ${sheetW} ${sheetH}`}
      className={className}
      role="img"
      aria-label={`Генплан участка: ${land.zones.map((z) => `${z.name} ${m2(z.area)}`).join(', ')}`}
    >
      <defs>
        <pattern
          id={hatch}
          width={fs * 0.6}
          height={fs * 0.6}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1={0} y1={0} x2={0} y2={fs * 0.6} stroke="#64748b" strokeWidth={sw * 0.6} />
        </pattern>
        <pattern id={tiles} width={0.6} height={0.6} patternUnits="userSpaceOnUse">
          <rect width={0.6} height={0.6} fill="none" stroke="#a8a29e" strokeWidth={0.03} />
        </pattern>
      </defs>
      <rect width={sheetW} height={sheetH} fill={PAPER} />
      <g transform={`translate(${pad} ${oy})`}>
        <rect
          width={W}
          height={L}
          fill={ZONE_FILL.lawn}
          stroke={INK}
          strokeWidth={sw * 2}
          strokeDasharray={`${sw * 8} ${sw * 3} ${sw} ${sw * 3}`}
        />
        {land.zones.map((z, i) => {
          const { x, y, w, h } = z.rect;
          const paved =
            z.kind === 'path' || z.kind === 'bbq' || z.kind === 'driveway' || z.kind === 'parking';
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                fill={ZONE_FILL[z.kind]}
                stroke={INK}
                strokeWidth={z.kind === 'house' ? sw * 2 : sw * 0.8}
              />
              {paved && <rect x={x} y={y} width={w} height={h} fill={`url(#${tiles})`} />}
              {z.kind === 'house' && (
                <rect x={x} y={y} width={w} height={h} fill={`url(#${hatch})`} />
              )}
              {z.kind === 'terrace' &&
                Array.from({ length: Math.floor(w / 0.3) }, (_, k) => (
                  <line
                    key={k}
                    x1={x + (k + 1) * 0.3}
                    y1={y}
                    x2={x + (k + 1) * 0.3}
                    y2={y + h}
                    stroke="#c4a57a"
                    strokeWidth={0.02}
                  />
                ))}
            </g>
          );
        })}
        {land.beds.map((b, i) => (
          <rect
            key={i}
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            fill="#c8a27a"
            stroke="#8b6a47"
            strokeWidth={sw * 0.6}
          />
        ))}
        {land.trees.map((t, i) => (
          <g key={i}>
            <circle
              cx={t.x}
              cy={t.y}
              r={1.3}
              fill="#b9dcaa"
              stroke="#4d7c3a"
              strokeWidth={sw * 0.8}
            />
            <circle cx={t.x} cy={t.y} r={0.12} fill="#4d7c3a" />
          </g>
        ))}
        {/* Gate and wicket on the street side. */}
        <g stroke={PAPER} strokeWidth={sw * 3}>
          <line
            x1={land.gate.x - land.gate.width / 2}
            y1={L}
            x2={land.gate.x + land.gate.width / 2}
            y2={L}
          />
          <line
            x1={land.wicket.x - land.wicket.width / 2}
            y1={L}
            x2={land.wicket.x + land.wicket.width / 2}
            y2={L}
          />
        </g>
        {!compact &&
          land.zones
            .filter((z) => z.kind !== 'path')
            .map((z, i) => {
              const { x, y, w, h } = z.rect;
              const size = Math.min(fs, (w * 0.9) / (Math.max(z.name.length, 8) * 0.56), h / 2.8);
              if (size < fs * 0.35) return null;
              return (
                <g key={i} fontFamily={FONT} textAnchor="middle" fill={INK}>
                  <text x={x + w / 2} y={y + h / 2 - size * 0.1} fontSize={size}>
                    {z.name}
                  </text>
                  <text x={x + w / 2} y={y + h / 2 + size} fontSize={size * 0.92} fontWeight={700}>
                    {m2(z.area)}
                  </text>
                </g>
              );
            })}
        {!compact && (
          <>
            <text
              x={W / 2}
              y={L + fs * 2.2}
              fontSize={fs}
              textAnchor="middle"
              fill={INK}
              fontFamily={FONT}
              letterSpacing={fs * 0.3}
            >
              УЛИЦА
            </text>
            <text
              x={land.gate.x}
              y={L - fs * 0.4}
              fontSize={fs * 0.7}
              textAnchor="middle"
              fill={INK}
              fontFamily={FONT}
            >
              ворота
            </text>
            <Dim x1={0} y1={0} x2={W} y2={0} offset={-fs * 2.6} fs={fs} metres />
            <Dim x1={0} y1={0} x2={0} y2={L} offset={-fs * 2.6} fs={fs} metres />
          </>
        )}
      </g>
      {!compact && (
        <>
          <NorthArrow x={sheetW - fs * 2} y={fs * 2.4} r={fs} />
          <text
            x={fs}
            y={fs * 1.6}
            fontSize={fs * 1.1}
            fontWeight={700}
            fill={INK}
            fontFamily={FONT}
          >
            Генплан, зонирование
          </text>
          <TitleBlock
            x={fs}
            y={sheetH - tbH - fs}
            w={sheetW - 2 * fs}
            h={tbH}
            code={code}
            title={title}
            sheet="Генплан, зонирование участка"
            style={styleTitle}
            scale="1:200"
            units="Размеры в м"
          />
        </>
      )}
    </svg>
  );
}
