import { describe, expect, it } from 'vitest';
import { directMessageLead, leadReply, needsLead } from './botDirectMessage';

describe('needsLead', () => {
  it('turns every unpublished private message into a lead', () => {
    expect(needsLead(null)).toBe(true); // the import crashed (database down)
    expect(needsLead({ status: 'ignored' })).toBe(true);
    expect(needsLead({ status: 'too_short' })).toBe(true);
    expect(needsLead({ status: 'duplicate', reason: 'repost' })).toBe(true);
  });

  it('skips messages that already became orders', () => {
    expect(needsLead({ status: 'created', orderId: 'o1', published: true })).toBe(false);
    expect(needsLead({ status: 'duplicate', reason: 'same message' })).toBe(false);
  });
});

describe('directMessageLead', () => {
  it('takes the phone from the text of the message', () => {
    const lead = directMessageLead({
      channel: 'telegram',
      text: 'Здравствуйте, сколько стоит смена? 89271112233',
      authorName: 'Иван',
      username: '@ivan',
      chatId: 42,
    });
    expect(lead).toEqual({
      name: 'Иван',
      phone: '+79271112233',
      message: 'Здравствуйте, сколько стоит смена? 89271112233',
      source: 'telegram-dm',
    });
  });

  it('prefers the phone shared by the messenger, falls back to the username or chat', () => {
    expect(
      directMessageLead({
        channel: 'whatsapp',
        text: 'Перезвоните',
        phone: '+79170001122',
        chatId: 'x',
      }).phone,
    ).toBe('+79170001122');
    expect(
      directMessageLead({ channel: 'telegram', text: 'Перезвоните', username: '@ivan', chatId: 1 })
        .phone,
    ).toBe('Telegram @ivan');
    const anonymous = directMessageLead({ channel: 'telegram', text: 'Привет', chatId: 7 });
    expect(anonymous.phone).toBe('Telegram chat 7');
    expect(anonymous.name).toBe('Клиент из Telegram');
  });

  it('answers differently with and without a phone', () => {
    const withPhone = directMessageLead({
      channel: 'telegram',
      text: 'тел 89271112233',
      chatId: 1,
    });
    expect(leadReply(withPhone, '+7 (927) 242-80-88', true)).toContain(
      'перезвоним на +79271112233',
    );
    const noPhone = directMessageLead({ channel: 'telegram', text: 'Привет', chatId: 1 });
    expect(leadReply(noPhone, '+7 (927) 242-80-88', true)).toContain('Оставьте номер');
    expect(leadReply(noPhone, '+7 (927) 242-80-88', false)).toContain('позвоните нам');
  });
});
