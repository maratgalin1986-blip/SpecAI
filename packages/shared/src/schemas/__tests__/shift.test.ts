import { describe, expect, it } from 'vitest';
import {
  SHIFT_STATUSES,
  SHIFT_TRANSITIONS,
  createEquipmentBlockSchema,
  createOperatorSchema,
  shiftTransitionSchema,
  timesheetSubmitSchema,
  updateOperatorSchema,
} from '../../index';

describe('shift transitions', () => {
  it('lead from PLANNED to FINISHED and nowhere after', () => {
    for (const status of SHIFT_STATUSES) {
      expect(SHIFT_TRANSITIONS[status]).toBeDefined();
    }
    expect(SHIFT_TRANSITIONS.FINISHED).toEqual([]);
    expect(SHIFT_TRANSITIONS.IDLE).toContain('WORKING');
    expect(SHIFT_TRANSITIONS.WORKING).toContain('IDLE');
  });

  it('accepts only https photos', () => {
    expect(shiftTransitionSchema.safeParse({ status: 'WORKING' }).success).toBe(true);
    expect(
      shiftTransitionSchema.safeParse({ status: 'ON_SITE', photoUrl: 'https://x.ru/a.jpg' })
        .success,
    ).toBe(true);
    expect(
      shiftTransitionSchema.safeParse({ status: 'ON_SITE', photoUrl: 'http://x.ru/a.jpg' }).success,
    ).toBe(false);
    expect(shiftTransitionSchema.safeParse({ status: 'DONE' }).success).toBe(false);
  });
});

describe('timesheetSubmitSchema', () => {
  it('coerces hours and defaults idle to 0', () => {
    const parsed = timesheetSubmitSchema.parse({ shiftId: 'abc', hoursWorked: '8' });
    expect(parsed.hoursWorked).toBe(8);
    expect(parsed.idleHours).toBe(0);
  });

  it('rejects more than a day of work', () => {
    expect(timesheetSubmitSchema.safeParse({ shiftId: 'abc', hoursWorked: 25 }).success).toBe(
      false,
    );
  });
});

describe('operator schemas', () => {
  it('needs both e-mail and password for a sign-in', () => {
    expect(createOperatorSchema.safeParse({ name: 'Иван' }).success).toBe(true);
    expect(createOperatorSchema.safeParse({ name: 'Иван', email: 'ivan@example.ru' }).success).toBe(
      false,
    );
    const parsed = createOperatorSchema.parse({
      name: 'Иван',
      email: ' Ivan@Example.ru ',
      password: 'secret123',
    });
    expect(parsed.email).toBe('ivan@example.ru');
  });

  it('lets the admin deactivate without touching the sign-in', () => {
    expect(updateOperatorSchema.safeParse({ active: false }).success).toBe(true);
    expect(updateOperatorSchema.safeParse({ email: 'a@b.ru' }).success).toBe(false);
  });
});

describe('createEquipmentBlockSchema', () => {
  it('keeps the range in order', () => {
    expect(
      createEquipmentBlockSchema.safeParse({ from: '2026-10-10', to: '2026-10-09' }).success,
    ).toBe(false);
    expect(
      createEquipmentBlockSchema.safeParse({ from: '2026-10-10', to: '2026-10-10' }).success,
    ).toBe(true);
  });
});
