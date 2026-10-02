import { describe, expect, it } from 'vitest';
import { HAMMER_RATE, MACHINE_WORKS, workRate } from './machineWorks';

describe('workRate', () => {
  it('charges the hammer rate for hammer jobs only', () => {
    const wheeled = MACHINE_WORKS['wheeled-excavator']!;
    expect(workRate(wheeled, 'Разбить бетон или асфальт гидромолотом')).toBe(HAMMER_RATE);
    expect(workRate(wheeled, 'Траншея в городе')).toBe(3000);
    const backhoe = MACHINE_WORKS.backhoe!;
    expect(workRate(backhoe, 'Работа гидромолотом: демонтаж, мёрзлый грунт')).toBe(3500);
    expect(workRate(backhoe, 'Уборка снега')).toBe(3000);
  });
  it('keeps the plain rate for machines without a hammer', () => {
    expect(workRate(MACHINE_WORKS.excavator!, 'Демонтаж зданий и конструкций')).toBe(3000);
  });
});
