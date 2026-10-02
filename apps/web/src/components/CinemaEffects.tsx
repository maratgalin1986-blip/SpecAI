'use client';

import { Cinema3D } from '@/components/Cinema3D';
import { CinemaClicks } from '@/components/CinemaClicks';
import { CinemaDolly } from '@/components/CinemaDolly';
import { CinemaFx } from '@/components/CinemaFx';
import { CinemaParticles } from '@/components/CinemaParticles';
import { SoundDirector } from '@/components/SoundDirector';

// Loaded lazily by CinemaLayer: one chunk, so shared helpers are not split
// and duplicated between several small lazy chunks.
export function CinemaEffects() {
  return (
    <>
      <CinemaClicks />
      <Cinema3D />
      <CinemaDolly />
      <CinemaFx />
      <CinemaParticles />
      <SoundDirector />
    </>
  );
}
