import { SITE } from '@/lib/site';

// Shared bits of the architectural sheets: dimension lines in millimetres,
// the north arrow and a simplified title block (штамп).

export const INK = '#0f172a';
export const PAPER = '#ffffff';
export const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export const mm = (m: number) => String(Math.round(m * 1000));
export const m2 = (n: number) => `${n.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} м²`;

/** A horizontal or vertical dimension line with 45° ticks and the size in mm. */
export function Dim({
  x1,
  y1,
  x2,
  y2,
  offset,
  fs,
  ext = true,
  metres = false,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Shift of the line from the measured points (negative — up/left). */
  offset: number;
  fs: number;
  ext?: boolean;
  /** Label in metres (site plans) instead of millimetres. */
  metres?: boolean;
}) {
  const horizontal = Math.abs(y1 - y2) < 1e-9;
  const len = horizontal ? Math.abs(x2 - x1) : Math.abs(y2 - y1);
  if (len < 0.05) return null;
  const a = horizontal ? { x: x1, y: y1 + offset } : { x: x1 + offset, y: y1 };
  const b = horizontal ? { x: x2, y: y2 + offset } : { x: x2 + offset, y: y2 };
  const t = fs * 0.35;
  const sw = fs * 0.06;
  const label = metres ? len.toFixed(1).replace('.', ',') : mm(len);
  const fits = len > label.length * fs * 0.55 + fs * 0.3;
  const size = fits ? fs : fs * 0.75;
  return (
    <g stroke={INK} strokeWidth={sw} fill="none">
      {ext && (
        <>
          <line
            x1={x1}
            y1={y1}
            x2={a.x + (horizontal ? 0 : Math.sign(offset) * t)}
            y2={a.y + (horizontal ? Math.sign(offset) * t : 0)}
          />
          <line
            x1={x2}
            y1={y2}
            x2={b.x + (horizontal ? 0 : Math.sign(offset) * t)}
            y2={b.y + (horizontal ? Math.sign(offset) * t : 0)}
          />
        </>
      )}
      <line
        x1={a.x - (horizontal ? t : 0)}
        y1={a.y - (horizontal ? 0 : t)}
        x2={b.x + (horizontal ? t : 0)}
        y2={b.y + (horizontal ? 0 : t)}
      />
      <line x1={a.x - t} y1={a.y + t} x2={a.x + t} y2={a.y - t} strokeWidth={sw * 2} />
      <line x1={b.x - t} y1={b.y + t} x2={b.x + t} y2={b.y - t} strokeWidth={sw * 2} />
      <text
        x={(a.x + b.x) / 2}
        y={(a.y + b.y) / 2}
        dy={horizontal ? -size * 0.35 : 0}
        dx={horizontal ? 0 : -size * 0.35}
        transform={horizontal ? undefined : `rotate(-90 ${(a.x + b.x) / 2} ${(a.y + b.y) / 2})`}
        fontSize={size}
        fill={INK}
        stroke="none"
        textAnchor="middle"
        fontFamily={FONT}
      >
        {label}
      </text>
    </g>
  );
}

/** A chain of dimensions through the given positions. */
export function DimChain({
  at,
  points,
  horizontal,
  offset,
  fs,
}: {
  at: number;
  points: number[];
  horizontal: boolean;
  offset: number;
  fs: number;
}) {
  const pts = [...new Set(points.map((p) => Math.round(p * 1000) / 1000))].sort((a, b) => a - b);
  return (
    <g>
      {pts
        .slice(1)
        .map((p, i) =>
          horizontal ? (
            <Dim key={p} x1={pts[i]!} y1={at} x2={p} y2={at} offset={offset} fs={fs} />
          ) : (
            <Dim key={p} x1={at} y1={pts[i]!} x2={at} y2={p} offset={offset} fs={fs} />
          ),
        )}
    </g>
  );
}

export function NorthArrow({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g stroke={INK} strokeWidth={r * 0.06} fontFamily={FONT}>
      <circle cx={x} cy={y} r={r} fill="none" />
      <path
        d={`M${x} ${y - r * 0.85} L${x + r * 0.35} ${y + r * 0.6} L${x} ${y + r * 0.3} Z`}
        fill={INK}
      />
      <path
        d={`M${x} ${y - r * 0.85} L${x - r * 0.35} ${y + r * 0.6} L${x} ${y + r * 0.3} Z`}
        fill={PAPER}
      />
      <text
        x={x}
        y={y - r * 1.2}
        fontSize={r * 0.8}
        textAnchor="middle"
        fill={INK}
        stroke="none"
        fontWeight={700}
      >
        С
      </text>
    </g>
  );
}

/** A simplified title block (штамп) of the sheet. */
export function TitleBlock({
  x,
  y,
  w,
  h,
  code,
  title,
  sheet,
  style,
  scale = '1:100',
  units = 'Размеры в мм',
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  code: string;
  title: string;
  sheet: string;
  style: string;
  scale?: string;
  units?: string;
}) {
  const fs = h / 5.2;
  const sw = fs * 0.07;
  const c1 = x + w * 0.38;
  const c2 = x + w * 0.74;
  const r1 = y + h / 3;
  const r2 = y + (2 * h) / 3;
  const pad = fs * 0.35;
  const t = (tx: number, ty: number, text: string, size = fs, weight = 400) => {
    // Squeeze a long line into its column instead of overflowing.
    const col = tx < c1 ? c1 - x : tx < c2 ? c2 - c1 : x + w - c2;
    const max = col - 2 * pad;
    const long = text.length * size * 0.56 > max;
    return (
      <text
        x={tx}
        y={ty}
        fontSize={size}
        fontWeight={weight}
        fill={INK}
        fontFamily={FONT}
        textLength={long ? max : undefined}
        lengthAdjust={long ? 'spacingAndGlyphs' : undefined}
      >
        {text}
      </text>
    );
  };
  return (
    <g>
      <g stroke={INK} strokeWidth={sw * 2} fill="none">
        <rect x={x} y={y} width={w} height={h} />
      </g>
      <g stroke={INK} strokeWidth={sw} fill="none">
        <line x1={c1} y1={y} x2={c1} y2={y + h} />
        <line x1={c2} y1={y} x2={c2} y2={y + h} />
        <line x1={c1} y1={r1} x2={x + w} y2={r1} />
        <line x1={c1} y1={r2} x2={x + w} y2={r2} />
      </g>
      {t(x + pad, y + fs * 1.3, SITE.name, fs * 1.15, 800)}
      {t(x + pad, y + fs * 2.6, 'Дизайн-проект', fs * 0.9)}
      {t(x + pad, y + fs * 3.75, code, fs * 0.8)}
      {t(x + pad, y + fs * 4.8, 'Стадия: эскиз', fs * 0.8)}
      {t(c1 + pad, y + fs * 1.15, title, fs * 0.85, 700)}
      {t(c1 + pad, r1 + fs * 1.15, sheet, fs * 0.85)}
      {t(c1 + pad, r2 + fs * 1.15, `Стиль: ${style}`, fs * 0.8)}
      {t(c2 + pad, y + fs * 1.15, `М ${scale}`, fs * 0.85)}
      {t(c2 + pad, r1 + fs * 1.15, 'Лист 1', fs * 0.85)}
      {t(c2 + pad, r2 + fs * 1.15, units, fs * 0.75)}
    </g>
  );
}
