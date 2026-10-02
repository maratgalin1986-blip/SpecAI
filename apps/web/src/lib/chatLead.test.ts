import { describe, expect, it } from 'vitest';
import { CHAT_LEAD_SOURCE, chatLeadRecord, chatLeadStep } from './chatLead';

describe('chatLeadStep', () => {
  it('ignores messages without a phone', () => {
    expect(chatLeadStep('Нужен экскаватор на завтра', true)).toEqual({ kind: 'none' });
  });

  it('asks for consent when a phone comes without it', () => {
    expect(chatLeadStep('перезвоните 8 900 000-00-00', undefined)).toEqual({
      kind: 'consent',
      phone: '+79000000000',
    });
    expect(chatLeadStep('+7 (900) 000-00-00', false).kind).toBe('consent');
  });

  it('saves a lead only with consent', () => {
    expect(chatLeadStep('89000000000, автокран', true)).toEqual({
      kind: 'lead',
      phone: '+79000000000',
    });
  });
});

describe('chatLeadRecord', () => {
  it('uses the account name or a placeholder', () => {
    expect(chatLeadRecord({ phone: '+79000000000', userTexts: ['a'] }).name).toBe('Имя не указано');
    expect(chatLeadRecord({ phone: '+7', userName: ' Иван ', userTexts: [] }).name).toBe('Иван');
  });

  it('keeps the conversation within 1000 characters', () => {
    const lead = chatLeadRecord({ phone: '+79000000000', userTexts: ['x'.repeat(2000)] });
    expect(lead.message.startsWith('Из чата на сайте:\n')).toBe(true);
    expect(lead.message).toHaveLength(1000);
    expect(lead.source).toBe(CHAT_LEAD_SOURCE);
  });
});
