import { describe, expect, it } from 'vitest';
import { emailFeatures, PASSWORD_RECOVERY_OFF_MESSAGE } from './emailFeatures';
import { SITE } from './site';

const env = (values: Record<string, string>) => values as unknown as NodeJS.ProcessEnv;

describe('emailFeatures', () => {
  it('offers nothing by e-mail while the mail integration is off', () => {
    expect(emailFeatures(env({}))).toEqual({ passwordRecovery: false, weeklyDigest: false });
    // A key without the sender address sends nothing either.
    expect(emailFeatures(env({ RESEND_API_KEY: 'key' }))).toEqual({
      passwordRecovery: false,
      weeklyDigest: false,
    });
    expect(emailFeatures(env({ RESEND_API_KEY: ' ', EMAIL_FROM: 'a@b.ru' })).weeklyDigest).toBe(
      false,
    );
  });

  it('offers both once the key and the sender are set', () => {
    expect(emailFeatures(env({ RESEND_API_KEY: 'key', EMAIL_FROM: 'a@b.ru' }))).toEqual({
      passwordRecovery: true,
      weeklyDigest: true,
    });
  });

  it('the «off» message does not promise a letter and gives the phone', () => {
    expect(PASSWORD_RECOVERY_OFF_MESSAGE).toContain(SITE.phone);
    expect(PASSWORD_RECOVERY_OFF_MESSAGE).not.toMatch(/отправили/);
  });
});
