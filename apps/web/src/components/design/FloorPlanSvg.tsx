import type { Building, Door, FloorPlan, Room, Win } from '@/lib/design/types';
import {
  Dim,
  DimChain,
  FONT,
  INK,
  m2,
  NorthArrow,
  PAPER,
  TitleBlock,
} from '@/components/design/PlanParts';

// A floor plan in the style of an architectural drawing: poché walls with
// thickness, door leaves with swing arcs, windows as three thin lines,
// room names with areas, dimension chains in millimetres, the north arrow
// and the title block. Everything in metres inside the viewBox.

function DoorMark({ d, t, sw }: { d: Door; t: number; sw: number }) {
  const w = d.width;
  const h = d.axis === 'x';
  // Gap in the wall.
  const gap = h ? (
    <rect x={d.x - w / 2} y={d.y - t / 2 - 0.01} width={w} height={t + 0.02} fill={PAPER} />
  ) : (
    <rect x={d.x - t / 2 - 0.01} y={d.y - w / 2} width={t + 0.02} height={w} fill={PAPER} />
  );
  if (d.kind === 'opening') {
    const j = (p: number) =>
      h ? (
        <line
          key={p}
          x1={p}
          y1={d.y - t / 2}
          x2={p}
          y2={d.y + t / 2}
          stroke={INK}
          strokeWidth={sw}
        />
      ) : (
        <line
          key={p}
          x1={d.x - t / 2}
          y1={p}
          x2={d.x + t / 2}
          y2={p}
          stroke={INK}
          strokeWidth={sw}
        />
      );
    const c = h ? d.x : d.y;
    return (
      <g>
        {gap}
        {j(c - w / 2)}
        {j(c + w / 2)}
      </g>
    );
  }
  if (d.kind === 'gate') {
    return (
      <g>
        {gap}
        {h ? (
          <line
            x1={d.x - w / 2}
            y1={d.y}
            x2={d.x + w / 2}
            y2={d.y}
            stroke={INK}
            strokeWidth={sw}
            strokeDasharray={`${sw * 4} ${sw * 3}`}
          />
        ) : (
          <line
            x1={d.x}
            y1={d.y - w / 2}
            x2={d.x}
            y2={d.y + w / 2}
            stroke={INK}
            strokeWidth={sw}
            strokeDasharray={`${sw * 4} ${sw * 3}`}
          />
        )}
      </g>
    );
  }
  // Hinge jamb, the wall face on the swing side, the open leaf and its arc.
  const s = d.swing;
  const hinge = h
    ? { x: d.hingeLow ? d.x - w / 2 : d.x + w / 2, y: d.y + (s * t) / 2 }
    : { x: d.x + (s * t) / 2, y: d.hingeLow ? d.y - w / 2 : d.y + w / 2 };
  const other = h
    ? { x: d.hingeLow ? d.x + w / 2 : d.x - w / 2, y: hinge.y }
    : { x: hinge.x, y: d.hingeLow ? d.y + w / 2 : d.y - w / 2 };
  const tip = h ? { x: hinge.x, y: hinge.y + s * w } : { x: hinge.x + s * w, y: hinge.y };
  const ax = tip.x - hinge.x;
  const ay = tip.y - hinge.y;
  const bx = other.x - hinge.x;
  const by = other.y - hinge.y;
  const sweep = ax * by - ay * bx > 0 ? 1 : 0;
  return (
    <g>
      {gap}
      <line
        x1={hinge.x}
        y1={hinge.y}
        x2={tip.x}
        y2={tip.y}
        stroke={INK}
        strokeWidth={d.kind === 'entrance' ? sw * 2.2 : sw * 1.5}
      />
      <path
        d={`M${tip.x} ${tip.y} A${w} ${w} 0 0 ${sweep} ${other.x} ${other.y}`}
        fill="none"
        stroke={INK}
        strokeWidth={sw * 0.7}
        strokeDasharray={`${sw * 3} ${sw * 2}`}
      />
    </g>
  );
}

function WindowMark({ win, t, sw }: { win: Win; t: number; sw: number }) {
  const w = win.width;
  if (win.axis === 'x') {
    const x0 = win.x - w / 2;
    return (
      <g stroke={INK} strokeWidth={sw * 0.8}>
        <rect x={x0} y={win.y - t / 2} width={w} height={t} fill={PAPER} />
        <line x1={x0} y1={win.y - t * 0.12} x2={x0 + w} y2={win.y - t * 0.12} />
        <line x1={x0} y1={win.y + t * 0.12} x2={x0 + w} y2={win.y + t * 0.12} />
      </g>
    );
  }
  const y0 = win.y - w / 2;
  return (
    <g stroke={INK} strokeWidth={sw * 0.8}>
      <rect x={win.x - t / 2} y={y0} width={t} height={w} fill={PAPER} />
      <line x1={win.x - t * 0.12} y1={y0} x2={win.x - t * 0.12} y2={y0 + w} />
      <line x1={win.x + t * 0.12} y1={y0} x2={win.x + t * 0.12} y2={y0 + w} />
    </g>
  );
}

function RoomLabel({ room, base }: { room: Room; base: number }) {
  const c = room.clear;
  const area = m2(room.area);
  const chars = Math.max(room.name.length, area.length);
  const fit = (w: number, h: number) => Math.min(base, (w * 0.9) / (chars * 0.62), h / 3);
  const flat = fit(c.w, c.h);
  const turned = fit(c.h, c.w);
  const rotate = turned > flat * 1.25;
  const fs = Math.max(rotate ? turned : flat, 0.08);
  const cx = c.x + c.w / 2;
  const cy = c.y + c.h / 2;
  return (
    <g
      transform={rotate ? `rotate(-90 ${cx} ${cy})` : undefined}
      fontFamily={FONT}
      textAnchor="middle"
      fill={INK}
    >
      <text x={cx} y={cy - fs * 0.15} fontSize={fs}>
        {room.name}
      </text>
      <text x={cx} y={cy + fs * 1.05} fontSize={fs * 0.92} fontWeight={700}>
        {area}
      </text>
    </g>
  );
}

export function FloorPlanSvg({
  building,
  floor,
  title = '',
  code = '',
  styleTitle = '',
  compact = false,
  className,
}: {
  building: Building;
  floor: FloorPlan;
  title?: string;
  code?: string;
  styleTitle?: string;
  /** Thumbnail: walls and openings only. */
  compact?: boolean;
  className?: string;
}) {
  const { L, W, ext, part } = building;
  const unit = Math.max(L, W);
  const fs = Math.min(0.32, Math.max(0.16, unit / 34));
  const sw = fs * 0.12;
  const pad = compact ? 0.3 : fs * 5.5;
  const right = compact ? 0.3 : fs * 5.5;
  const sheetW = compact ? L + 0.6 : Math.max(L + pad + right, 9.5 * fs * 3.2);
  const ox = compact ? 0.3 : pad + (sheetW - (L + pad + right)) / 2;
  const oy = compact ? 0.3 : fs * 5;
  const tbH = fs * 6.5;
  const sheetH = compact ? W + 0.6 : oy + W + fs * 5 + tbH + fs;
  const outerPath = `M0 0H${L}V${W}H0Z M${ext} ${ext}V${W - ext}H${L - ext}V${ext}Z`;
  const inner = { x0: ext, y0: ext, x1: L - ext, y1: W - ext };
  // Chains: partition axes along the south and the east walls.
  const between = (vals: number[], lo: number, hi: number) =>
    vals.filter((v) => v > lo + 1e-6 && v < hi - 1e-6);
  const touching = (pred: (r: Room) => boolean) => floor.rooms.filter(pred);
  const chainS = [
    0,
    L,
    ...between(
      touching((r) => Math.abs(r.cell.y + r.cell.h - inner.y1) < 1e-6).flatMap((r) => [
        r.cell.x,
        r.cell.x + r.cell.w,
      ]),
      inner.x0,
      inner.x1,
    ),
  ];
  const chainE = [
    0,
    W,
    ...between(
      touching((r) => Math.abs(r.cell.x + r.cell.w - inner.x1) < 1e-6).flatMap((r) => [
        r.cell.y,
        r.cell.y + r.cell.h,
      ]),
      inner.y0,
      inner.y1,
    ),
  ];
  return (
    <svg
      viewBox={`0 0 ${sheetW} ${sheetH}`}
      className={className}
      role="img"
      aria-label={`${floor.label}: ${floor.rooms.map((r) => `${r.name} ${m2(r.area)}`).join(', ')}`}
    >
      <rect x={0} y={0} width={sheetW} height={sheetH} fill={PAPER} />
      <g transform={`translate(${ox} ${oy})`}>
        {/* Zones of open spaces (dashed). */}
        {!compact &&
          floor.rooms.flatMap((r) =>
            r.zones.map((z, i) => (
              <g key={`${r.id}z${i}`}>
                <rect
                  x={z.rect.x + 0.15}
                  y={z.rect.y + 0.15}
                  width={Math.max(0, z.rect.w - 0.3)}
                  height={Math.max(0, z.rect.h - 0.3)}
                  fill="none"
                  stroke="#64748b"
                  strokeWidth={sw * 0.6}
                  strokeDasharray={`${sw * 4} ${sw * 3}`}
                />
                <text
                  x={z.rect.x + 0.3}
                  y={z.rect.y + 0.3 + fs * 0.8}
                  fontSize={fs * 0.8}
                  fill="#475569"
                  fontStyle="italic"
                  textAnchor="start"
                  fontFamily={FONT}
                >
                  {z.name}
                </text>
              </g>
            )),
          )}
        {/* Walls. */}
        <path d={outerPath} fill={INK} fillRule="evenodd" />
        {floor.partitions.map((s, i) =>
          s.y1 === s.y2 ? (
            <rect
              key={i}
              x={s.x1}
              y={s.y1 - part / 2}
              width={s.x2 - s.x1}
              height={part}
              fill={INK}
            />
          ) : (
            <rect
              key={i}
              x={s.x1 - part / 2}
              y={s.y1}
              width={part}
              height={s.y2 - s.y1}
              fill={INK}
            />
          ),
        )}
        {floor.windows.map((w, i) => (
          <WindowMark key={i} win={w} t={ext} sw={sw} />
        ))}
        {floor.doors.map((d, i) => (
          <DoorMark key={i} d={d} t={d.rooms[1] === null ? ext : part} sw={sw} />
        ))}
        {floor.rooms
          .filter((r) => r.kind === 'stair')
          .map((r) => {
            const c = r.clear;
            const along = c.h > c.w;
            const n = Math.max(4, Math.floor((along ? c.h : c.w) / 0.28));
            return (
              <g key={r.id} stroke={INK} strokeWidth={sw * 0.6}>
                {Array.from({ length: n - 1 }, (_, k) => {
                  const p = ((k + 1) / n) * (along ? c.h : c.w);
                  return along ? (
                    <line key={k} x1={c.x} y1={c.y + p} x2={c.x + c.w} y2={c.y + p} />
                  ) : (
                    <line key={k} x1={c.x + p} y1={c.y} x2={c.x + p} y2={c.y + c.h} />
                  );
                })}
              </g>
            );
          })}
        {!compact &&
          floor.rooms
            .filter((r) => r.kind !== 'stair' || r.clear.w * r.clear.h > 3)
            .map((r) => <RoomLabel key={r.id} room={r} base={fs} />)}
        {!compact && (
          <>
            <Dim x1={0} y1={0} x2={L} y2={0} offset={-fs * 3.2} fs={fs} />
            <Dim x1={0} y1={0} x2={0} y2={W} offset={-fs * 3.2} fs={fs} />
            <DimChain at={W} points={chainS} horizontal offset={fs * 2.2} fs={fs} />
            <DimChain at={L} points={chainE} horizontal={false} offset={fs * 2.2} fs={fs} />
          </>
        )}
      </g>
      {!compact && (
        <>
          <NorthArrow x={sheetW - fs * 2.2} y={fs * 2.4} r={fs * 1.1} />
          <text
            x={fs}
            y={fs * 1.6}
            fontSize={fs * 1.1}
            fontWeight={700}
            fill={INK}
            fontFamily={FONT}
          >
            {floor.label}
          </text>
          <TitleBlock
            x={fs}
            y={sheetH - tbH - fs}
            w={sheetW - 2 * fs}
            h={tbH}
            code={code}
            title={title}
            sheet={floor.label}
            style={styleTitle}
          />
        </>
      )}
    </svg>
  );
}
