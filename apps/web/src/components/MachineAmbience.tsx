'use client';

import type { MachineType } from '@/lib/machinePhotos';
import { useMachineSound } from '@/components/useMachineSound';

/** The machine's quiet idle loop on its own page (only while sound is on). */
export function MachineAmbience({ type }: { type: MachineType }) {
  useMachineSound('page', type, true);
  return null;
}
