import type { Mood } from '@/lib/stroyka/mood';
import type { BanterSpeaker } from '@/lib/stroykaJokes';

// Blocky, stylised portraits (not real people), in the voxel style of the world.
const LOOK: Record<
  BanterSpeaker,
  {
    helmet: string;
    vest: string;
    skin: string;
    hair: string;
    extra: 'mustache' | 'beard' | 'headset' | 'glasses' | 'pencil' | 'none';
  }
> = {
  mihalych: {
    helmet: '#f1f5f9',
    vest: '#f97316',
    skin: '#d39a74',
    hair: '#9ca3af',
    extra: 'mustache',
  },
  rinat: { helmet: '#f97316', vest: '#f97316', skin: '#c98d68', hair: '#1f2937', extra: 'beard' },
  sveta: { helmet: '#dc2626', vest: '#facc15', skin: '#e6b08c', hair: '#7c4a2a', extra: 'headset' },
  ildar: { helmet: '#f59e0b', vest: '#f97316', skin: '#c48a62', hair: '#374151', extra: 'glasses' },
  alsu: { helmet: '#38bdf8', vest: '#facc15', skin: '#e2a982', hair: '#2b1d14', extra: 'pencil' },
  worker: { helmet: '#f1f5f9', vest: '#f97316', skin: '#cf9670', hair: '#4b5563', extra: 'none' },
};

const INK = '#111827';
const LIP = '#7f1d1d';
const MOUTH = '#3a0f0e';

/** Eyes, brows and mouth for a mood, in the 64×64 portrait grid. */
function Face({ mood, hair }: { mood: Mood; hair: string }) {
  const eyes = (y = 27, h = 4, dx = 0) => (
    <>
      <rect x={24 + dx} y={y} width="4" height={h} fill={INK} />
      <rect x={36 + dx} y={y} width="4" height={h} fill={INK} />
    </>
  );
  const brows = (left: string, right: string) => (
    <>
      <polygon points={left} fill={hair} />
      <polygon points={right} fill={hair} />
    </>
  );
  const flat = (y: number) =>
    brows(`22,${y} 30,${y} 30,${y + 2} 22,${y + 2}`, `34,${y} 42,${y} 42,${y + 2} 34,${y + 2}`);
  switch (mood) {
    case 'happy':
      return (
        <g data-mood="happy">
          {eyes(27, 3)}
          {flat(23)}
          <rect x="27" y="39" width="10" height="2" fill={LIP} />
          <rect x="25" y="37" width="2" height="2" fill={LIP} />
          <rect x="37" y="37" width="2" height="2" fill={LIP} />
        </g>
      );
    case 'laugh':
      return (
        <g data-mood="laugh">
          <rect x="23" y="28" width="2" height="2" fill={INK} />
          <rect x="25" y="27" width="2" height="2" fill={INK} />
          <rect x="27" y="28" width="2" height="2" fill={INK} />
          <rect x="35" y="28" width="2" height="2" fill={INK} />
          <rect x="37" y="27" width="2" height="2" fill={INK} />
          <rect x="39" y="28" width="2" height="2" fill={INK} />
          {flat(23)}
          <rect x="26" y="36" width="12" height="7" fill={MOUTH} />
          <rect x="28" y="40" width="8" height="3" fill="#c0504a" />
        </g>
      );
    case 'angry':
      return (
        <g data-mood="angry">
          {eyes(28, 3)}
          {brows('22,22 30,24 30,26 22,24', '34,24 42,22 42,24 34,26')}
          <rect x="27" y="39" width="10" height="2" fill={LIP} />
          <rect x="25" y="41" width="2" height="2" fill={LIP} />
          <rect x="37" y="41" width="2" height="2" fill={LIP} />
        </g>
      );
    case 'surprised':
      return (
        <g data-mood="surprised">
          {eyes(25, 6)}
          {flat(21)}
          <rect x="29" y="36" width="6" height="7" fill={MOUTH} />
        </g>
      );
    case 'thinking':
      return (
        <g data-mood="thinking">
          {eyes(26, 4, 1)}
          {brows('22,24 30,24 30,26 22,26', '34,21 42,22 42,24 34,23')}
          <rect x="31" y="39" width="6" height="2" fill={LIP} />
        </g>
      );
    case 'tired':
      return (
        <g data-mood="tired">
          <rect x="23" y="28" width="6" height="1" fill={INK} />
          <rect x="35" y="28" width="6" height="1" fill={INK} />
          <rect x="24" y="29" width="4" height="2" fill={INK} />
          <rect x="36" y="29" width="4" height="2" fill={INK} />
          {flat(25)}
          <rect x="29" y="39" width="6" height="1" fill={LIP} />
        </g>
      );
    case 'proud':
      return (
        <g data-mood="proud">
          {eyes(28, 3)}
          {flat(23)}
          <rect x="27" y="39" width="10" height="2" fill={LIP} />
          <rect x="37" y="37" width="2" height="2" fill={LIP} />
        </g>
      );
    case 'worried':
      return (
        <g data-mood="worried">
          {eyes(27, 4)}
          {brows('22,25 30,22 30,24 22,27', '34,22 42,25 42,27 34,24')}
          <rect x="27" y="40" width="3" height="1" fill={LIP} />
          <rect x="30" y="39" width="4" height="1" fill={LIP} />
          <rect x="34" y="40" width="3" height="1" fill={LIP} />
        </g>
      );
    case 'radio':
      return (
        <g data-mood="radio">
          {eyes(27, 4, -1)}
          {flat(23)}
          <rect x="29" y="37" width="6" height="4" fill={MOUTH} />
          <rect x="46" y="32" width="6" height="11" fill="#1f2937" />
          <rect x="50" y="26" width="1" height="6" fill="#1f2937" />
          <rect x="47" y="34" width="4" height="2" fill="#34d399" />
        </g>
      );
    default:
      return (
        <g data-mood="neutral">
          {eyes()}
          {flat(23)}
          <rect x="28" y="38" width="8" height="2" fill={LIP} opacity="0.6" />
        </g>
      );
  }
}

export function Portrait({
  speaker,
  mood = 'neutral',
  className = '',
}: {
  speaker: BanterSpeaker;
  mood?: Mood;
  className?: string;
}) {
  const l = LOOK[speaker];
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      aria-hidden
      shapeRendering="crispEdges"
      data-testid="portrait"
      data-mood={mood}
    >
      <rect width="64" height="64" fill="#1e293b" />
      <rect x="0" y="40" width="64" height="24" fill={l.vest} />
      <rect x="0" y="50" width="64" height="4" fill="#f8fafc" opacity="0.85" />
      <rect x="18" y="18" width="28" height="26" fill={l.skin} />
      {(speaker === 'sveta' || speaker === 'alsu') && (
        <rect x={speaker === 'alsu' ? 12 : 44} y="22" width="8" height="18" fill={l.hair} />
      )}
      <rect x="18" y="18" width="28" height="3" fill={l.hair} />
      <rect x="14" y="10" width="36" height="10" fill={l.helmet} />
      <rect x="12" y="18" width="40" height="3" fill={l.helmet} />
      {l.extra === 'mustache' && <rect x="24" y="35" width="16" height="3" fill={l.hair} />}
      {l.extra === 'beard' && (
        <rect x="20" y="36" width="24" height="8" fill={l.hair} opacity="0.8" />
      )}
      {l.extra === 'headset' && (
        <>
          <rect x="14" y="24" width="4" height="10" fill="#111827" />
          <rect x="18" y="36" width="10" height="2" fill="#111827" />
        </>
      )}
      {l.extra === 'pencil' && <rect x="44" y="16" width="3" height="12" fill="#f59e0b" />}
      <Face mood={mood} hair={l.hair} />
      {l.extra === 'glasses' && (
        <>
          <rect x="22" y="26" width="8" height="6" fill="#111827" opacity="0.55" />
          <rect x="34" y="26" width="8" height="6" fill="#111827" opacity="0.55" />
          <rect x="30" y="28" width="4" height="2" fill="#111827" />
        </>
      )}
    </svg>
  );
}
