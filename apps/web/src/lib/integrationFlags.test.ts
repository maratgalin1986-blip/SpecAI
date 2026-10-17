import { describe, expect, it } from 'vitest';

const { integrationFlags } = await import('./integrationFlags');

describe('integrationFlags', () => {
  it('says only yes or no, never a value', () => {
    const result = integrationFlags({
      ANTHROPIC_API_KEY: 'sk-secret',
      RESEND_API_KEY: 're_secret',
      EMAIL_FROM: '',
      TELEGRAM_BOT_TOKEN: '1:abc',
      TELEGRAM_CHAT_ID: '42',
    } as unknown as NodeJS.ProcessEnv);
    expect(result).toEqual({
      ai: true,
      email: false,
      telegram: true,
      cronSecret: false,
      blob: false,
    });
    expect(JSON.stringify(result)).not.toMatch(/secret|abc|42/);
  });
});
