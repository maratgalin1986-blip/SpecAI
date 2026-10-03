import { describe, expect, it } from 'vitest';
import { HAMMER_RATE, MACHINE_WORKS } from '@/lib/machineWorks';
import { CRANE_HEAVY_RATE } from '@/lib/smeta';
import {
  BOUNDS,
  DIALOGUE,
  FORM_NODE,
  nextZone,
  OBSTACLES,
  ORDER_LABEL,
  orderReply,
  P,
  PIT,
  PRICES,
  PLAYER_RADIUS,
  SPEAKERS,
  TOUR_PATH,
  ZONES,
  detectZone,
  hourlyRate,
  orderMessage,
  resolveCollision,
  rub,
  tourStops,
  zoneById,
  zoneDialogue,
} from '@/lib/stroyka';
import { stageNode } from '@/lib/stroyka/stage';
import { STAGES, worldProgress } from '@/lib/stroyka/progress';

const inside = (x: number, z: number) =>
  OBSTACLES.some((b) => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ);

describe('dialogue graph', () => {
  it('every zone opens an existing line spoken by its NPC', () => {
    for (const zone of ZONES) {
      const node = zoneDialogue(zone.id);
      expect(node.speaker).toBe(zone.speaker);
      expect(SPEAKERS[node.speaker]).toBeDefined();
    }
  });

  it('every reply leads somewhere real, 2–3 replies per line', () => {
    for (const node of Object.values(DIALOGUE)) {
      expect(node.replies.length).toBeGreaterThanOrEqual(2);
      expect(node.replies.length).toBeLessThanOrEqual(4);
      for (const reply of node.replies) {
        const action = reply.action;
        if (action.kind === 'goto') expect(DIALOGUE[action.node]).toBeDefined();
        if (action.kind === 'zone') expect(() => zoneById(action.zone)).not.toThrow();
        if (action.kind === 'link') {
          const wizard = /^\/\?m=([a-z-]+)#podbor$/.exec(action.href);
          if (wizard) expect(MACHINE_WORKS[wizard[1] as never]).toBeDefined();
          else
            expect(['tel:+79272428088', '/#podbor', '/smeta', '/smeta?mode=snab']).toContain(
              action.href,
            );
        }
      }
    }
    expect(DIALOGUE[FORM_NODE]?.form).toBe(true);
  });

  it('the excavator line and its replies match the brief', () => {
    const node = DIALOGUE.kotlovan!;
    expect(node.text).toContain(P(PRICES.other));
    expect(node.replies.map((r) => r.action)).toEqual([
      { kind: 'form' },
      { kind: 'link', href: '/?m=backhoe#podbor' },
      { kind: 'link', href: 'tel:+79272428088' },
      { kind: 'next' },
    ]);
    expect(node.replies[0]).toMatchObject({
      label: ORDER_LABEL,
      primary: true,
      set: { machine: 'backhoe' },
    });
    expect(node.replies[1]!.label).toBe('Подробнее о технике');
  });

  // The amber button orders right here, in the film: Света's form opens under
  // her line with the machine filled in; the wizard (another page) is secondary.
  it('keeps the order button in the film in every zone', () => {
    for (const zone of ZONES) {
      const node = DIALOGUE[zone.root]!;
      for (const reply of node.replies.filter((r) => r.primary))
        expect(reply.action.kind, `${zone.id}: ${reply.label}`).toBe('form');
      if (zone.order) {
        const primary = node.replies.find((r) => r.primary);
        expect(primary?.set?.machine, zone.id).toBe(zone.order);
        expect(primary?.label).toBe(ORDER_LABEL);
      }
    }
    expect(orderReply('crane')).toEqual({
      label: ORDER_LABEL,
      action: { kind: 'form' },
      primary: true,
      set: { machine: 'crane' },
    });
  });

  it('keeps the order in the film at the object, whatever the stage', () => {
    const p = worldProgress(Date.now(), null);
    for (const stage of STAGES) {
      const node = stageNode({ ...p, stageKey: stage.key });
      expect(node.replies[0]!.action.kind).toBe('form');
      expect(node.replies[0]!.primary).toBe(true);
      expect(node.text).toMatch(/₽\/ч с\sмашинистом/);
    }
  });

  it('writes every price as «от … ₽/ч с машинистом»', () => {
    expect(P(4000)).toBe(`от\u00a0${rub(4000)}\u00a0₽/ч с\u00a0машинистом`);
    expect(P(3300)).toMatch(/^от\s3\s300\s₽\/ч с\sмашинистом$/);
    for (const node of Object.values(DIALOGUE))
      for (const m of node.text.matchAll(/₽\/ч/g)) {
        const tail = node.text.slice(m.index!, m.index! + 16);
        expect(tail, node.id).toMatch(/^₽\/ч с\sмашинистом/);
        expect(node.text.slice(Math.max(0, m.index! - 12), m.index!), node.id).toMatch(
          /[оО]т\s[\d\s]+\s$/,
        );
      }
  });

  it('goes round the stops for «Дальше по объекту»', () => {
    expect(nextZone('gate')).toBe(ZONES[1]!.id);
    expect(nextZone(ZONES[ZONES.length - 1]!.id)).toBe('gate');
  });

  it('quotes the owner prices', () => {
    // Prices come from the site's sources of truth, never hard-coded.
    expect(PRICES.truck).toBe(MACHINE_WORKS.truck!.rate);
    expect(PRICES.crane).toBe(MACHINE_WORKS.crane!.rate);
    expect(PRICES.hammer).toBe(HAMMER_RATE);
    expect(PRICES.crane32).toBe(CRANE_HEAVY_RATE);
    expect(DIALOGUE.montazh!.text).toContain(rub(PRICES.crane));
    expect(DIALOGUE.montazh!.text).toContain(rub(PRICES.crane32));
    expect(DIALOGUE.doroga!.text).toContain(rub(PRICES.truck));
    expect(DIALOGUE.korpus!.text).toContain(rub(PRICES.agp));
    expect(hourlyRate('truck')).toBe(MACHINE_WORKS.truck!.rate);
    expect(hourlyRate('backhoe')).toBe(MACHINE_WORKS.backhoe!.rate);
    expect(rub(24000)).toBe((24000).toLocaleString('ru-RU'));
    expect(orderMessage('crane')).toBe('Нужен: Автокран. ');
    expect(orderMessage(null)).toBe('');
  });
});

describe('zones', () => {
  it('detects the zone around a point, with hysteresis at the edge', () => {
    const kotlovan = zoneById('kotlovan');
    const [cx, cz] = kotlovan.center;
    expect(detectZone(cx, cz)).toBe('kotlovan');
    const edge = cx + kotlovan.radius + 1;
    expect(detectZone(edge, cz)).toBe(null);
    expect(detectZone(edge, cz, 'kotlovan')).toBe('kotlovan');
    expect(detectZone(0, 0)).toBe(null);
  });

  it('stands and NPCs are reachable and inside their zones', () => {
    for (const zone of ZONES) {
      expect(inside(...zone.stand)).toBe(false);
      expect(inside(...zone.npc)).toBe(false);
      expect(detectZone(...zone.stand)).toBe(zone.id);
    }
  });

  it('the tour stops at every zone once', () => {
    const stops = tourStops().map((s) => s.zone);
    expect([...stops].sort()).toEqual(ZONES.map((z) => z.id).sort());
    for (const { index, zone } of tourStops()) {
      expect(TOUR_PATH[index]!.p).toEqual(zoneById(zone).stand);
    }
  });
});

describe('collisions', () => {
  it('pushes the walker out of a box', () => {
    const [x, z] = resolveCollision((PIT.minX + PIT.maxX) / 2, PIT.maxZ - 0.5);
    expect(z).toBeCloseTo(PIT.maxZ + PLAYER_RADIUS);
    expect(x).toBeCloseTo((PIT.minX + PIT.maxX) / 2);
  });

  it('keeps a free point and clamps to the site bounds', () => {
    expect(resolveCollision(0, 30)).toEqual([0, 30]);
    expect(resolveCollision(500, -500)).toEqual([BOUNDS.maxX, BOUNDS.minZ]);
  });

  it('lets you through the door but not through the wall', () => {
    const [, zDoor] = resolveCollision(24, -22.5);
    expect(zDoor).toBe(-22.5);
    const [, zWall] = resolveCollision(18, -22.5);
    expect(Math.abs(zWall + 22.5)).toBeGreaterThan(0.85);
  });
});
