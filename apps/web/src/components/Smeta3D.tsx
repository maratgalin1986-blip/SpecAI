'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { sceneDrawing, stageSeconds, type Scene } from '@/lib/smeta3d';

// A schematic 3D drawing of the client's own site: thin wireframe lines on a
// dark blueprint grid, dimension lines and leaders, a title block. SVG paths
// computed in lib/smeta3d; re-rendered only when the stage or the view
// changes. Playback steps through the stages with a cheap dash-draw.

const rub = (n: number) => `${n.toLocaleString('ru-RU')} ₽`;
const CYAN = '#5ee0ff';
const WHITE = '#eaf8ff';
const AMBER = '#fbbf24';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

export function Smeta3D({
  scene,
  title,
  onLockClick,
}: {
  scene: Scene;
  /** «Частный дом 10×8 м» for the title block. */
  title: string;
  onLockClick?: () => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const n = scene.stages.length;
  const max = Math.min(n, scene.lockAt);
  const [width, setWidth] = useState(360);
  const [yaw, setYaw] = useState(-0.6);
  const [stage, setStage] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [locked, setLocked] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches));
    const el = wrap.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(260, Math.round(el.clientWidth)));
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // New inputs or an unlock start the film from the plot outline.
  useEffect(() => {
    setStage(0);
    setPlaying(false);
    setLocked(false);
  }, [scene]);

  // Playback steps the stages; it stops at the lock in the partial version.
  useEffect(() => {
    if (!playing) return;
    const id = window.setTimeout(
      () => {
        if (stage + 1 < max) setStage(stage + 1);
        else {
          setPlaying(false);
          if (max < n) setLocked(true);
        }
      },
      stageSeconds(n) * 1000,
    );
    return () => window.clearTimeout(id);
  }, [playing, stage, max, n]);

  const height = Math.round(Math.min(460, Math.max(280, width * 0.78)));
  const drawing = useMemo(
    () => sceneDrawing(scene, yaw, width, height),
    [scene, yaw, width, height],
  );

  const go = (i: number) => {
    setPlaying(false);
    if (i >= max) {
      setStage(max - 1);
      if (max < n) setLocked(true);
      return;
    }
    setLocked(false);
    setStage(Math.max(0, i));
  };
  const play = () => {
    if (locked) return onLockClick?.();
    if (!playing && stage >= max - 1) setStage(0);
    setPlaying((p) => !p);
  };

  // Drag to rotate the view; vertical swipes keep scrolling the page.
  const drag = useRef<number | null>(null);
  const s = scene.stages[stage]!;
  const btn =
    'inline-flex min-h-10 items-center justify-center rounded-full px-4 text-sm font-semibold';
  const tbW = 172;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div
        ref={wrap}
        className="relative overflow-hidden rounded-xl border border-cyan-900 bg-[#0a1a2f]"
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          height={height}
          role="img"
          aria-label={`Схема стройки, этап ${stage + 1} из ${n}: ${s.title}`}
          className="block cursor-grab touch-pan-y select-none"
          onPointerDown={(e) => {
            drag.current = e.clientX;
            e.currentTarget.setPointerCapture?.(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (drag.current === null) return;
            const dx = e.clientX - drag.current;
            if (Math.abs(dx) < 2) return;
            drag.current = e.clientX;
            setYaw((y) => y + dx * 0.012);
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          fontFamily={MONO}
        >
          <style>{`.sd path{stroke-dasharray:1;stroke-dashoffset:1;animation:sd 1.2s ease-out forwards}@keyframes sd{to{stroke-dashoffset:0}}@media (prefers-reduced-motion:reduce){.sd path{animation:none;stroke-dashoffset:0}}`}</style>
          <defs>
            <pattern id="bp" width="16" height="16" patternUnits="userSpaceOnUse">
              <path d="M16 0H0V16" fill="none" stroke={CYAN} strokeOpacity="0.07" />
            </pattern>
          </defs>
          <rect width={width} height={height} fill="url(#bp)" />
          {drawing.stages.slice(0, stage + 1).map((g, i) => {
            const now = i === stage;
            // Finished stages stay as faint outlines; the plot keeps its dimensions.
            const showDims = now || i === 0;
            return (
              <g key={now ? `now-${stage}` : i} fill="none" strokeWidth="1" opacity={now ? 1 : 0.4}>
                <path d={g.chain} stroke={CYAN} strokeDasharray="8 3 2 3" />
                {now && <path d={g.hatch} stroke={CYAN} strokeOpacity="0.45" strokeWidth="0.6" />}
                <g className={now && !reduced ? 'sd' : undefined}>
                  <path d={g.d} stroke={now ? WHITE : CYAN} pathLength={1} />
                </g>
                {now && <path d={g.sym} stroke={AMBER} strokeWidth="0.9" />}
                {showDims && (
                  <path d={g.dims} stroke={CYAN} strokeOpacity="0.8" strokeWidth="0.7" />
                )}
                {(showDims ? g.dimTexts : []).map((t, k) => (
                  <text
                    key={k}
                    x={t.x}
                    y={t.y}
                    transform={`rotate(${t.angle} ${t.x} ${t.y})`}
                    textAnchor="middle"
                    fontSize="10"
                    fill={CYAN}
                    stroke="none"
                  >
                    {t.text}
                  </text>
                ))}
                {now &&
                  g.leaders.map((l, k) => (
                    <g key={k} stroke={AMBER} strokeWidth="0.8">
                      <circle cx={l.ax} cy={l.ay} r="1.8" fill={AMBER} />
                      <path
                        d={`M${l.ax} ${l.ay}L${l.x} ${l.y + 3}H${l.right ? l.x + l.text.length * 6 : l.x - l.text.length * 6}`}
                      />
                      <text
                        x={l.x}
                        y={l.y}
                        textAnchor={l.right ? 'start' : 'end'}
                        fontSize="10"
                        fill={AMBER}
                        stroke="none"
                      >
                        {l.text}
                      </text>
                    </g>
                  ))}
              </g>
            );
          })}
          {/* Title block. */}
          <g transform={`translate(${width - tbW - 6} ${height - 50})`} fontSize="8.5" fill={CYAN}>
            <rect width={tbW} height="44" fill="#0a1a2f" stroke={CYAN} strokeWidth="0.8" />
            <path
              d={`M0 11H${tbW}M0 22H${tbW}M0 33H${tbW}M112 22V44`}
              stroke={CYAN}
              strokeWidth="0.5"
            />
            <text x="4" y="8.5" fill={WHITE}>
              {title.slice(0, 30)}
            </text>
            <text x="4" y="19.5">
              Этап {stage + 1}/{n}: {s.title.slice(0, 20)}
            </text>
            <text x="4" y="30.5">
              Схема · примерно
            </text>
            <text x="116" y="30.5">
              М {drawing.scale}
            </text>
            <text x="4" y="41.5" fill={AMBER}>
              СпецПласт16
            </text>
            <text x="116" y="41.5">
              {max < n ? 'частично' : 'полная'}
            </text>
          </g>
        </svg>
        {locked && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0a1a2f]/75 p-4 text-center backdrop-blur-sm">
            <span className="text-2xl" aria-hidden>
              🔒
            </span>
            <p className="font-mono text-sm font-semibold text-white">Дальше — в полной смете</p>
            <button
              type="button"
              onClick={onLockClick}
              className={`${btn} bg-amber-500 text-slate-950`}
            >
              Открыть полную смету
            </button>
          </div>
        )}
      </div>

      <dl
        className="grid grid-cols-[auto_1fr] gap-x-3 border border-cyan-900 bg-slate-900 px-3 py-2 font-mono text-[0.7rem] leading-5 text-slate-300"
        aria-live="polite"
      >
        <dt className="text-cyan-400">Этап</dt>
        <dd className="text-white">
          {stage + 1}. {s.title} · {s.metric}
        </dd>
        <dt className="text-cyan-400">Техника</dt>
        <dd>
          {s.machines}
          {s.hours ? ` · ${s.hours} ч` : ''}
          {s.days ? ` · ~${s.days} дн.` : ''}
        </dd>
        <dt className="text-cyan-400">Итого</dt>
        <dd className="text-amber-300">
          {s.cost ? `≈ ${rub(s.cost)} · ` : ''}нарастающим ≈ {rub(s.cumulative)}
        </dd>
      </dl>

      <div className="flex flex-wrap items-center gap-2">
        {!reduced && (
          <button type="button" onClick={play} className={`${btn} bg-cyan-400 text-slate-950`}>
            {playing ? '❚❚ Пауза' : '▶ Смотреть стройку'}
          </button>
        )}
        <button
          type="button"
          onClick={() => go(stage - 1)}
          className={`${btn} ring-1 ring-slate-300`}
          aria-label="Предыдущий этап"
        >
          ◀
        </button>
        <button
          type="button"
          onClick={() => go(stage + 1)}
          className={`${btn} ring-1 ring-slate-300`}
          aria-label="Следующий этап"
        >
          ▶
        </button>
        <input
          type="range"
          min={0}
          max={n - 1}
          step={1}
          value={stage}
          onChange={(e) => go(Number(e.target.value))}
          aria-label="Этап стройки"
          className="min-w-0 flex-1 accent-cyan-400"
        />
      </div>
    </div>
  );
}
