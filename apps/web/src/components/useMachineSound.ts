'use client';

import { useEffect } from 'react';
import type { MachineType } from '@/lib/machinePhotos';
import { announceMachine, type MachineSource } from '@/lib/sound';

/**
 * Tells the sound director which machine this part of the page shows. The
 * director plays it only while sound is on; with sound off this costs one
 * event per change.
 */
export function useMachineSound(
  source: MachineSource,
  type: MachineType | null | undefined,
  active = true,
): void {
  const value = active && type ? type : null;
  useEffect(() => {
    announceMachine(source, value);
  }, [source, value]);
  useEffect(() => () => announceMachine(source, null), [source]);
}
