import { describe, expect, it } from 'vitest';
import {
  BASE_PER_DAY,
  progressFromUnits,
  progressLine,
  projectType,
  projectUnits,
  sinceLastVisit,
  STAGES,
  WEIGHTS,
  WORLD_START,
  worldProgress,
} from '@/lib/stroyka/progress';

const DAY = 86_400_000;

describe('district progress', () => {
  it('stage weights cover exactly one object', () => {
    expect(STAGES.reduce((sum, s) => sum + s.weight, 0)).toBeCloseTo(1, 10);
  });

  it('starts with the pit of ЖК «Кама»', () => {
    const p = worldProgress(WORLD_START, null);
    expect(p.projectIndex).toBe(0);
    expect(p.projectName).toBe('ЖК «Кама»');
    expect(p.stageKey).toBe('pit');
    expect(p.totalPercent).toBe(0);
    expect(p.live).toBe(false);
  });

  it('switches stages exactly at the boundaries', () => {
    expect(progressFromUnits(0.0799).stageKey).toBe('pit');
    expect(progressFromUnits(0.08).stageKey).toBe('foundation');
    expect(progressFromUnits(0.18).stageKey).toBe('frame');
    expect(progressFromUnits(0.4799).stageKey).toBe('frame');
    expect(progressFromUnits(0.48).stageKey).toBe('roof');
    expect(progressFromUnits(0.99).stageKey).toBe('handover');
  });

  it('builds the frame floor by floor', () => {
    const start = progressFromUnits(0.18);
    expect(start.floorsBuilt).toBe(1);
    const mid = progressFromUnits(0.18 + 0.3 * 0.7);
    expect(mid.floorsBuilt).toBe(7);
    expect(progressLine(mid)).toBe('Объект: ЖК «Кама» — каркас, 7-й этаж из 9 · 39%');
    expect(progressFromUnits(0.5).floorsBuilt).toBe(9);
    expect(progressFromUnits(0.05).floorsBuilt).toBe(0);
  });

  it('rolls over to a new object next door, keeping the finished ones', () => {
    const p = progressFromUnits(2.05);
    expect(p.projectIndex).toBe(2);
    expect(p.stageKey).toBe('pit');
    expect(p.finishedProjects.map((f) => f.index)).toEqual([0, 1]);
    expect(p.finishedProjects[0]!.name).toBe('ЖК «Кама»');
    for (let i = 1; i < 20; i++) expect(projectType(i).key).not.toBe(projectType(i - 1).key);
  });

  it('takes 4–6 weeks per object at modest traffic, 7 weeks on time alone', () => {
    expect(1 / BASE_PER_DAY).toBeCloseTo(49);
    // About two leads, an order and a couple of bids a day.
    const perDay = BASE_PER_DAY + 2 * WEIGHTS.lead + WEIGHTS.order + 2 * WEIGHTS.bid;
    const days = 1 / perDay;
    expect(days).toBeGreaterThan(28);
    expect(days).toBeLessThan(42);
  });

  it('falls back to the time-only formula when the database is down', () => {
    const now = WORLD_START + 10 * DAY;
    const down = worldProgress(now, null);
    expect(down.live).toBe(false);
    expect(down.totalPercent).toBe(Math.round(10 * BASE_PER_DAY * 100));
    const up = worldProgress(now, { leads: 10, orders: 0, bids: 0, comments: 0 });
    expect(up.live).toBe(true);
    expect(up.totalPercent).toBeGreaterThan(down.totalPercent);
    expect(projectUnits(WORLD_START - DAY)).toBe(0);
  });

  it('tells a returning visitor what changed, without inventing anything', () => {
    const before = progressFromUnits(0.18 + 0.3 * 0.25);
    const now = progressFromUnits(0.18 + 0.3 * 0.6);
    expect(sinceLastVisit(before, now)).toBe('Пока вас не было: залили 3 этажа');
    expect(sinceLastVisit(now, now)).toBe(null);
    expect(sinceLastVisit(null, now)).toBe(null);
    expect(sinceLastVisit(progressFromUnits(0.9), progressFromUnits(1.02))).toContain(
      'сдали ЖК «Кама»',
    );
  });
});
