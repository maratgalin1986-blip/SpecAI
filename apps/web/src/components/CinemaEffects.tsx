'use client';

import { Cinema3D } from '@/components/Cinema3D';
import { CinemaClicks } from '@/components/CinemaClicks';
import { CinemaDolly } from '@/components/CinemaDolly';
import { CinemaFx } from '@/components/CinemaFx';
import { CinemaParticles } from '@/components/CinemaParticles';
import { ShowRuntime } from '@/components/ShowRuntime';
import { SoundDirector } from '@/components/SoundDirector';
import { usePlatformEffects } from '@/components/usePlatformEffects';

// Loaded lazily by CinemaLayer: one chunk, so shared helpers are not split
// and duplicated between several small lazy chunks. Off on a client's site
// (components/usePlatformEffects.ts).
export function CinemaEffects({ sound = true }: { sound?: boolean }) {
  const platform = usePlatformEffects();
  if (!platform) return null;
  return (
    <>
      <CinemaClicks />
      <Cinema3D />
      <CinemaDolly />
      <CinemaFx />
      <CinemaParticles />
      <ShowRuntime />
      {sound && <SoundDirector />}
    </>
  );
}
