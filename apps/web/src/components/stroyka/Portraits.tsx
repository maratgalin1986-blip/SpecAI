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

export function Portrait({
  speaker,
  className = '',
}: {
  speaker: BanterSpeaker;
  className?: string;
}) {
  const l = LOOK[speaker];
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden shapeRendering="crispEdges">
      <rect width="64" height="64" fill="#1e293b" />
      <rect x="0" y="40" width="64" height="24" fill={l.vest} />
      <rect x="0" y="50" width="64" height="4" fill="#f8fafc" opacity="0.85" />
      <rect x="18" y="18" width="28" height="26" fill={l.skin} />
      {(speaker === 'sveta' || speaker === 'alsu') && (
        <rect x={speaker === 'alsu' ? 12 : 44} y="22" width="8" height="18" fill={l.hair} />
      )}
      <rect x="18" y="18" width="28" height="4" fill={l.hair} />
      <rect x="14" y="10" width="36" height="10" fill={l.helmet} />
      <rect x="12" y="18" width="40" height="3" fill={l.helmet} />
      <rect x="24" y="27" width="4" height="4" fill="#111827" />
      <rect x="36" y="27" width="4" height="4" fill="#111827" />
      {l.extra === 'glasses' && (
        <>
          <rect x="22" y="26" width="8" height="6" fill="#111827" opacity="0.85" />
          <rect x="34" y="26" width="8" height="6" fill="#111827" opacity="0.85" />
          <rect x="30" y="28" width="4" height="2" fill="#111827" />
        </>
      )}
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
      <rect x="28" y="38" width="8" height="2" fill="#7f1d1d" opacity="0.6" />
    </svg>
  );
}
