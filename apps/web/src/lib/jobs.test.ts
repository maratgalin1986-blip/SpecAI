import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { shiftExample } from './cities';
import { JOBS, jobBySlug, jobLanding, jobMachineLabel, jobMachineRate, jobRate } from './jobs';
import { landingBySlug, LANDINGS } from './landings';
import { MACHINE_LABELS } from './machinePhotos';
import { CRANE_HEAVY_RATE, HAMMER_RATE, rateOf, rub, SHIFT_HOURS } from './prices';

const pageSource = (...parts: string[]) =>
  readFileSync(join(__dirname, '..', 'app', ...parts), 'utf8');

describe('job pages', () => {
  it('has the eight jobs with unique slugs', () => {
    expect(JOBS.map((j) => j.slug)).toEqual([
      'kopka-transhei',
      'kotlovan-pod-fundament',
      'septik',
      'vyvoz-snega',
      'demontazh',
      'planirovka-uchastka',
      'podyom-gruzov-kranom',
      'montazh-na-vysote',
    ]);
    expect(jobBySlug('septik')?.name).toBe('Яма под септик');
    expect(jobBySlug('nope')).toBeUndefined();
  });

  it('references existing machines and landing slugs', () => {
    for (const job of JOBS) {
      expect(job.machines.length).toBeGreaterThan(0);
      expect(jobLanding(job)).toBeDefined();
      for (const machine of job.machines) {
        expect(MACHINE_LABELS[machine.type]).toBeDefined();
        const landing = landingBySlug(machine.landing);
        expect(landing, `${job.slug}: ${machine.landing}`).toBeDefined();
        // The landing is the page of that very machine.
        expect(landing!.machine).toBe(machine.type);
      }
    }
    const slugs = new Set(LANDINGS.map((l) => l.slug));
    expect(JOBS.every((job) => job.machines.every((m) => slugs.has(m.landing)))).toBe(true);
  });

  it('takes every price from lib/prices.ts', () => {
    for (const job of JOBS) {
      for (const machine of job.machines) {
        const expected = machine.hammer
          ? HAMMER_RATE
          : machine.heavy
            ? CRANE_HEAVY_RATE
            : rateOf(machine.type);
        expect(jobMachineRate(machine)).toBe(expected);
      }
      expect(jobRate(job)).toBe(jobMachineRate(job.machines[0]!));
    }
    expect(jobRate(jobBySlug('kopka-transhei')!)).toBe(4000);
    expect(jobRate(jobBySlug('demontazh')!)).toBe(4500);
    expect(jobRate(jobBySlug('montazh-na-vysote')!)).toBe(3500);
    expect(jobRate(jobBySlug('podyom-gruzov-kranom')!)).toBe(4500);
    const heavy = jobBySlug('podyom-gruzov-kranom')!.machines.find((m) => m.heavy)!;
    expect(jobMachineRate(heavy)).toBe(5500);
    expect(jobMachineLabel(heavy)).toBe('Автокран 32 т');
  });

  it('writes out the example shift computed from the rate', () => {
    for (const job of JOBS) {
      const rate = jobRate(job);
      expect(shiftExample(rate)).toBe(
        `${SHIFT_HOURS}\u00a0ч × ${rub(rate)}\u00a0₽ = ${rub(rate * SHIFT_HOURS)}\u00a0₽`,
      );
    }
  });

  it('never writes «СП16»', () => {
    const texts = JOBS.map((job) => JSON.stringify(job));
    texts.push(pageSource('raboty', 'page.tsx'));
    texts.push(pageSource('raboty', '[slug]', 'page.tsx'));
    for (const text of texts) expect(text).not.toContain('СП16');
  });
});
