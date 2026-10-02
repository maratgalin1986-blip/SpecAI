import { describe, expect, it } from 'vitest';
import { buildSmeta, SMETA_JOBS } from './smeta';
import {
  fitView,
  jobScene,
  project,
  projectScene,
  scaleLabel,
  sceneDrawing,
  stageSeconds,
  type View,
} from './smeta3d';
import { buildProject } from './smetaProject';

const view: View = { yaw: 0, pitch: 0.6, scale: 10, cx: 100, cy: 80 };
const close = (a: [number, number], b: [number, number]) => {
  expect(a[0]).toBeCloseTo(b[0], 6);
  expect(a[1]).toBeCloseTo(b[1], 6);
};

describe('projection', () => {
  it('puts the origin in the centre and lifts points with height', () => {
    expect(project([0, 0, 0], view)).toEqual([100, 80]);
    expect(project([0, 0, 2], view)[1]).toBeLessThan(80);
    expect(project([1, 0, 0], view)[0]).toBeCloseTo(110);
  });

  it('rotates around the vertical axis', () => {
    close(project([3, 2, 1], { ...view, yaw: 2 * Math.PI }), project([3, 2, 1], view));
    close(project([1, 0, 0], { ...view, yaw: Math.PI / 2 }), project([0, 1, 0], view));
  });

  it('fits the object inside the canvas at any angle', () => {
    for (const yaw of [0, 0.7, 2, 4]) {
      const v = fitView({ L: 10, W: 8, depth: 1.5, height: 7, margin: 3 }, 360, 280, yaw);
      for (const p of [
        [-5, -4, -1.5],
        [5, 4, 7],
        [5, -4, 0],
        [-5, 4, 7],
      ] as const) {
        const [x, y] = project(p, v);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(360);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(280);
      }
    }
  });

  it('names a drawing scale and paces the film to about 24 s', () => {
    expect(scaleLabel(10)).toBe('1:500');
    expect(stageSeconds(10) * 10).toBeCloseTo(24);
    expect(stageSeconds(2)).toBe(3.5);
  });
});

describe('scenes', () => {
  it('opens the plot and as many stages as the priced list before the lock', () => {
    const p = buildProject({ object: 'house', floors: 2 });
    const locked = projectScene(p, false);
    expect(locked.stages[0]!.kind).toBe('plot');
    expect(locked.stages).toHaveLength(p.stages.length + 1);
    expect(locked.lockAt).toBe(5);
    expect(projectScene(p, true).lockAt).toBe(locked.stages.length);
    expect(locked.stages.at(-1)!.cumulative).toBe(p.total);
  });

  it('draws every stage of every object and job as SVG paths', () => {
    const scenes = [
      ...(['house', 'banya', 'warehouse', 'site', 'strip'] as const).map((object) =>
        projectScene(buildProject({ object }), true),
      ),
      ...SMETA_JOBS.map((job) => jobScene(buildSmeta(job.id)!, {})),
    ];
    for (const scene of scenes) {
      const d = sceneDrawing(scene, -0.6, 360, 300);
      expect(d.stages).toHaveLength(scene.stages.length);
      for (const s of d.stages) {
        expect(s.d + s.chain + s.hatch + s.sym).toMatch(/^M[\d.-]/);
        expect(s.d + s.chain + s.hatch + s.dims + s.sym).not.toContain('NaN');
      }
    }
  });

  it('labels the plot with its length and width', () => {
    const d = sceneDrawing(
      projectScene(buildProject({ object: 'house', length: 10, width: 8 }), true),
      0,
      360,
      300,
    );
    expect(d.stages[0]!.dimTexts.map((t) => t.text)).toEqual(['10 м', '8 м']);
  });
});
