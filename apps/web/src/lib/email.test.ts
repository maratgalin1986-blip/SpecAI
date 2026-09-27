import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isEmailConfigured, resetEmailClient, sendEmail } from './email';

const originalEnv = { ...process.env };

beforeEach(() => {
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  resetEmailClient();
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe('sendEmail without configuration', () => {
  it('returns skipped and does not throw when RESEND_API_KEY is missing', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    expect(isEmailConfigured()).toBe(false);

    const result = await sendEmail({
      to: 'client@example.com',
      subject: 'Тест',
      html: '<p>Тест</p>',
      text: 'Тест',
    });

    expect(result).toEqual({ skipped: true, reason: 'RESEND_API_KEY is not set' });
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining('[email] skipped'),
      expect.objectContaining({ subject: 'Тест' }),
    );
  });

  it('skips when EMAIL_FROM is missing even with an API key', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    process.env.RESEND_API_KEY = 're_test';
    const result = await sendEmail({ to: 'a@example.com', subject: 's', html: '<p>s</p>' });
    expect(result).toEqual({ skipped: true, reason: 'EMAIL_FROM is not set' });
  });

  it('skips when there are no recipients', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const result = await sendEmail({ to: [], subject: 's', html: '<p>s</p>' });
    expect(result).toEqual({ skipped: true, reason: 'no recipients' });
  });
});
