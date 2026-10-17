import { afterEach, describe, expect, it, vi } from 'vitest';

const send = vi.fn<(input: Record<string, unknown>) => Promise<unknown>>(async () => ({
  data: { id: 'm1' },
  error: null,
}));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send };
  },
}));

const { resetEmailClient, sendEmail } = await import('./email');
const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  resetEmailClient();
  send.mockClear();
});

describe('sendEmail headers', () => {
  it('passes extra headers (List-Unsubscribe) to Resend', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.EMAIL_FROM = 'news@example.com';
    const headers = {
      'List-Unsubscribe': '<https://example.com/api/unsubscribe?t=x>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    };
    await sendEmail({ to: 'a@example.com', subject: 's', html: '<p>s</p>', headers });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ headers }));
  });

  it('sends no headers field when none are given', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.EMAIL_FROM = 'news@example.com';
    await sendEmail({ to: 'a@example.com', subject: 's', html: '<p>s</p>' });
    expect(send.mock.calls[0]?.[0]).not.toHaveProperty('headers');
  });
});
