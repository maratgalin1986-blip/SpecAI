import { describe, expect, it } from 'vitest';
import { applyPrefsUpdate, settingsView } from './settingsView';
import { DEFAULT_PREFS, type ServerChannels } from './routing';

const FREE_ONLY: ServerChannels = {
  telegram: true,
  push: true,
  email: true,
  whatsapp: false,
  sms: false,
};

describe('settingsView', () => {
  it('marks WhatsApp and SMS «скоро» and disabled until set up', () => {
    const view = settingsView(
      { ...DEFAULT_PREFS, sms: true },
      { userId: 'u', email: 'a@b.ru' },
      FREE_ONLY,
    );
    const sms = view.channels.find((c) => c.id === 'sms')!;
    expect(sms).toMatchObject({ soon: true, available: false, enabled: false, active: false });
    expect(view.channels.map((c) => c.id)).toEqual([
      'telegram',
      'push',
      'email',
      'whatsapp',
      'sms',
    ]);
  });

  it('shows what actually works', () => {
    const view = settingsView(
      DEFAULT_PREFS,
      { userId: 'u', email: 'a@b.ru', telegramChatId: '1', pushTokens: [] },
      FREE_ONLY,
    );
    const byId = Object.fromEntries(view.channels.map((c) => [c.id, c]));
    expect(byId.telegram!.active).toBe(true);
    expect(byId.push!.active).toBe(false);
    expect(byId.push!.hint).toContain('приложение');
    expect(view.telegram).toEqual({ linked: true, botConfigured: true });
  });
});

describe('applyPrefsUpdate', () => {
  it('changes only the channels sent', () => {
    expect(applyPrefsUpdate(DEFAULT_PREFS, { email: false }, FREE_ONLY)).toEqual({
      ok: true,
      prefs: { ...DEFAULT_PREFS, email: false },
    });
  });

  it('refuses non-boolean values and empty updates', () => {
    expect(applyPrefsUpdate(DEFAULT_PREFS, { email: 'yes' }, FREE_ONLY).ok).toBe(false);
    expect(applyPrefsUpdate(DEFAULT_PREFS, { foo: true }, FREE_ONLY).ok).toBe(false);
    expect(applyPrefsUpdate(DEFAULT_PREFS, null, FREE_ONLY).ok).toBe(false);
  });

  it('cannot switch on a channel that is «скоро», but can switch it off', () => {
    expect(applyPrefsUpdate(DEFAULT_PREFS, { whatsapp: true }, FREE_ONLY)).toMatchObject({
      ok: false,
    });
    expect(
      applyPrefsUpdate({ ...DEFAULT_PREFS, sms: true }, { sms: false }, FREE_ONLY),
    ).toMatchObject({ ok: true });
    expect(
      applyPrefsUpdate(DEFAULT_PREFS, { whatsapp: true }, { ...FREE_ONLY, whatsapp: true }),
    ).toMatchObject({ ok: true });
  });
});
