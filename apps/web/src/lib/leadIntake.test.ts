import { describe, expect, it, vi, type Mock } from 'vitest';
import { acceptLead, leadMessage, UNSAVED_LEAD_WARNING, type LeadData } from './leadIntake';

const lead: LeadData = {
  name: 'Иван',
  phone: '+7 900 000-00-00',
  message: 'Нужен экскаватор на завтра',
  source: 'home',
};

function deps(overrides: { save?: Mock; notify?: Mock } = {}) {
  return {
    save: overrides.save ?? vi.fn().mockResolvedValue({ id: 'lead-1' }),
    notify: overrides.notify ?? vi.fn().mockResolvedValue(true),
    siteName: 'СпецПласт16',
    onSaveError: vi.fn(),
  };
}

describe('acceptLead', () => {
  it('saves the lead and announces it without a warning', async () => {
    const d = deps();
    await expect(acceptLead(lead, d)).resolves.toBe('saved');
    expect(d.save).toHaveBeenCalledWith(lead);
    expect(d.notify).toHaveBeenCalledOnce();
    expect(d.notify).toHaveBeenCalledWith(expect.not.stringContaining(UNSAVED_LEAD_WARNING));
    expect(d.onSaveError).not.toHaveBeenCalled();
  });

  it('still announces the lead when the database is down', async () => {
    const dbError = new Error("Can't reach database server");
    const d = deps({ save: vi.fn().mockRejectedValue(dbError) });
    await expect(acceptLead(lead, d)).resolves.toBe('notified-only');
    expect(d.onSaveError).toHaveBeenCalledWith(dbError);
    expect(d.notify).toHaveBeenCalledWith(expect.stringContaining('+7 900 000-00-00'));
    expect(d.notify).toHaveBeenCalledWith(expect.stringContaining(UNSAVED_LEAD_WARNING));
  });

  it('reports a lost lead when neither the database nor Telegram worked', async () => {
    const d = deps({
      save: vi.fn().mockRejectedValue(new Error('down')),
      notify: vi.fn().mockResolvedValue(false),
    });
    await expect(acceptLead(lead, d)).resolves.toBe('lost');
  });

  it('treats a throwing notifier as not delivered', async () => {
    const d = deps({
      save: vi.fn().mockRejectedValue(new Error('down')),
      notify: vi.fn().mockRejectedValue(new Error('network')),
    });
    await expect(acceptLead(lead, d)).resolves.toBe('lost');
  });

  it('keeps a saved lead saved even if Telegram fails', async () => {
    const d = deps({ notify: vi.fn().mockResolvedValue(false) });
    await expect(acceptLead(lead, d)).resolves.toBe('saved');
  });
});

describe('leadMessage', () => {
  it('omits empty optional lines', () => {
    const text = leadMessage({ ...lead, message: null, source: null }, 'СпецПласт16', true);
    expect(text).toBe(
      ['📞 Новая заявка на звонок — СпецПласт16', 'Имя: Иван', 'Телефон: +7 900 000-00-00'].join(
        '\n',
      ),
    );
  });
});
