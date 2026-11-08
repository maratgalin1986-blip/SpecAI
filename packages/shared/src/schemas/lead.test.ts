import { describe, expect, it } from 'vitest';
import { leadCrmPatchSchema } from './lead';

describe('leadCrmPatchSchema', () => {
  it('accepts the CRM fields and parses callAt into a Date', () => {
    const parsed = leadCrmPatchSchema.safeParse({
      note: '  договорились на вторник  ',
      city: 'Казань',
      callAt: '2026-10-23T09:00:00+03:00',
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.note).toBe('договорились на вторник');
    expect(parsed.data.callAt).toBeInstanceOf(Date);
    expect(parsed.data.callAt?.toISOString()).toBe('2026-10-23T06:00:00.000Z');
  });

  it('null clears a field; an empty body is rejected', () => {
    expect(leadCrmPatchSchema.safeParse({ callAt: null, note: null }).success).toBe(true);
    expect(leadCrmPatchSchema.safeParse({}).success).toBe(false);
  });

  it('rejects junk: a bad date, an over-long note, an unknown status', () => {
    expect(leadCrmPatchSchema.safeParse({ callAt: 'завтра' }).success).toBe(false);
    expect(leadCrmPatchSchema.safeParse({ note: 'х'.repeat(2001) }).success).toBe(false);
    expect(leadCrmPatchSchema.safeParse({ status: 'CALL' }).success).toBe(false);
  });
});
