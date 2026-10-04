import { describe, expect, it } from 'vitest';
import {
  finishedLine,
  formatDate,
  nextStageLine,
  objectDays,
  objectSchedule,
  OUTER_PLOTS,
  plotOf,
  progressAt,
  progressAtStage,
  progressFromUnits,
  progressLine,
  projectType,
  projectUnits,
  RECIPES,
  sinceLastVisit,
  stageDays,
  STAGES,
  TIMELINE_START,
  WORLD_START,
  worldProgress,
} from '@/lib/stroyka/progress';

const DAY = 86_400_000;
const msk = (iso: string) => Date.parse(`${iso}T12:00:00+03:00`);

describe('the timeline', () => {
  it('starts with ЖК «Кама» and goes on to the kindergarten, the school and Кама-2', () => {
    expect([0, 1, 2, 3].map((i) => projectType(i).name)).toEqual([
      'ЖК «Кама»',
      'Детский сад на 220 мест',
      'Школа на 825 мест',
      'ЖК «Кама-2»',
    ]);
    expect(projectType(4).key).toBe('sport');
    expect(projectType(5).key).toBe('clinic');
    expect(projectType(6).name).toBe('ЖК «Кама-3»');
    expect(projectType(7).name).toBe('Детский сад № 2 на 220 мест');
    expect(WORLD_START).toBe(TIMELINE_START);
  });

  it('uses realistic durations for a 17-storey monolithic block', () => {
    const d = stageDays('housing');
    expect(RECIPES.housing.floors).toBe(17);
    expect(d[0]).toBeGreaterThanOrEqual(30); // котлован 1–1.5 months
    expect(d[0]).toBeLessThanOrEqual(45);
    expect(d[1]).toBeGreaterThanOrEqual(40); // фундаментная плита ~1.5 months
    expect(d[2]! / 17).toBeGreaterThanOrEqual(7); // a floor per 7–10 days
    expect(d[2]! / 17).toBeLessThanOrEqual(10);
    expect(d[3]).toBeGreaterThanOrEqual(25); // кровля ~1 month
    expect(d[4]).toBeGreaterThanOrEqual(90); // фасад 3–4 months
    expect(d[4]).toBeLessThanOrEqual(120);
    expect(d[5]! + d[6]!).toBeGreaterThanOrEqual(120); // сети + отделка 4–6 months
    expect(d[5]! + d[6]!).toBeLessThanOrEqual(180);
    expect(d[7]).toBeGreaterThanOrEqual(45); // благоустройство 1.5–2 months
    expect(d[7]).toBeLessThanOrEqual(60);
    expect(objectDays('kindergarten')).toBeLessThan(objectDays('school'));
    expect(objectDays('school')).toBeLessThan(objectDays('housing'));
  });

  it('shows ЖК «Кама» at the pit, 70%, on 3 October 2026', () => {
    const p = progressAt(msk('2026-10-03'));
    expect(p.projectIndex).toBe(0);
    expect(p.plot).toBe(0);
    expect(p.stageKey).toBe('pit');
    expect(p.stagePercent).toBe(70);
    expect(progressLine(p)).toBe('Объект: ЖК «Кама» — котлован (этап 70%) · 5%');
    expect(p.finishedProjects).toEqual([]);
    expect(p.nextMilestone.stageName).toBe('фундамент');
    expect(formatDate(p.nextMilestone.startsAt)).toBe('15.10.2026');
    expect(nextStageLine(p)).toBe('Дальше: фундамент — примерно с 15.10.2026');
    expect(p.nextProject.name).toBe('Детский сад на 220 мест');
    expect(finishedLine(p)).toBe(null);
  });

  it('is the same all Moscow day and moves on the next one', () => {
    const morning = progressAt(Date.parse('2026-10-03T00:30:00+03:00'));
    const night = progressAt(Date.parse('2026-10-03T23:50:00+03:00'));
    const next = progressAt(Date.parse('2026-10-04T00:10:00+03:00'));
    expect(night.stagePercent).toBe(morning.stagePercent);
    expect(next.stagePercent).toBeGreaterThan(night.stagePercent);
    expect(progressAt(TIMELINE_START - 10 * DAY).stagePercent).toBe(0);
  });

  it('switches stages exactly on the scheduled days', () => {
    const s = objectSchedule(0);
    for (const stage of s.stages) {
      expect(progressAt(stage.startsAt).stageKey).toBe(stage.key);
      if (stage.key !== 'pit')
        expect(progressAt(stage.startsAt - DAY).stageKey).not.toBe(stage.key);
    }
    expect(s.endsAt - s.startsAt).toBe(objectDays('housing') * DAY);
    expect(objectSchedule(1).startsAt).toBe(s.endsAt);
  });

  it('builds the frame floor by floor, about a floor every 8 days', () => {
    const frame = objectSchedule(0).stages[2]!;
    expect(progressAt(frame.startsAt).floorsBuilt).toBe(1);
    expect(progressAt(frame.startsAt + 8 * DAY).floorsBuilt).toBe(2);
    const mid = progressAtStage(0, 'frame', 0.4);
    expect(mid.floorsBuilt).toBe(7);
    expect(progressLine(mid)).toMatch(/^Объект: ЖК «Кама» — каркас, 7-й этаж из 17 · \d+%$/);
    expect(progressAtStage(0, 'roof').floorsBuilt).toBe(17);
    expect(progressAtStage(0, 'pit', 0.5).floorsBuilt).toBe(0);
  });

  it('hands over Кама and starts the kindergarten on its own plot', () => {
    const kama = objectSchedule(0);
    const p = progressAt(kama.endsAt + 5 * DAY);
    expect(p.projectIndex).toBe(1);
    expect(p.plot).toBe(1);
    expect(p.stageKey).toBe('pit');
    expect(p.finishedProjects).toEqual([
      expect.objectContaining({ index: 0, name: 'ЖК «Кама»', plot: 0, finishedAt: kama.endsAt }),
    ]);
    expect(finishedLine(p)).toMatch(/^Сдано: ЖК «Кама» \(\d\d\.20\d\d\)$/);
    const handover = progressAtStage(0, 'handover', 0.5);
    expect(nextStageLine(handover)).toMatch(/^Дальше: Детский сад на 220 мест — примерно с /);
  });

  it('never puts two standing objects on one plot', () => {
    for (let i = 0; i < 30; i++) {
      const p = progressAtStage(i, 'frame', 0.5);
      const plots = [p.plot, ...p.finishedProjects.map((f) => f.plot)];
      expect(new Set(plots).size).toBe(plots.length);
      expect(plots).toContain(0);
      expect(plotOf(i)).toBeLessThanOrEqual(OUTER_PLOTS);
    }
  });

  it('keeps the old entry points working', () => {
    const now = msk('2027-06-01');
    expect(worldProgress(now, null).live).toBe(false);
    expect(worldProgress(now, { leads: 9, orders: 1, bids: 0, comments: 0 }).live).toBe(true);
    expect(worldProgress(now, null).stagePercent).toBe(progressAt(now).stagePercent);
    const units = projectUnits(now);
    expect(Math.floor(units)).toBe(0);
    expect(progressFromUnits(units).stageKey).toBe(progressAt(now).stageKey);
    expect(progressFromUnits(1.0).projectName).toBe('Детский сад на 220 мест');
    expect(STAGES).toHaveLength(9);
  });

  it('tells a returning visitor what changed, without inventing anything', () => {
    const before = progressAtStage(0, 'frame', 0.25);
    const now = progressAtStage(0, 'frame', 0.45);
    expect(sinceLastVisit(before, now)).toBe('Пока вас не было: залили 3 этажа');
    expect(sinceLastVisit(now, now)).toBe(null);
    expect(sinceLastVisit(null, now)).toBe(null);
    expect(sinceLastVisit(progressAtStage(0, 'landscape'), progressFromUnits(1.02))).toContain(
      'сдали ЖК «Кама»',
    );
  });
});
