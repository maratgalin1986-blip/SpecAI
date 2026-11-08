import { describe, expect, it } from 'vitest';
import { invitationMessage, invitedLine, priorityBadgeText, priorityDate } from './referralBonus';

const NOW = new Date('2026-10-17T09:00:00Z');

describe('«Пригласи друга» in the app', () => {
  it('formats the Moscow day, not the phone’s', () => {
    expect(priorityDate('2026-10-24T09:00:00Z')).toBe('24 октября');
    expect(priorityDate('2026-10-23T21:00:00Z')).toBe('24 октября');
    expect(priorityDate('2026-01-01T00:00:00Z')).toBe('1 января');
    expect(priorityDate('garbage')).toBeNull();
  });

  it('shows the badge only while the bonus lasts', () => {
    expect(priorityBadgeText('2026-10-24T09:00:00Z', NOW)).toBe(
      '🚀 Заявки приходят вам на 5 минут раньше — до 24 октября',
    );
    expect(priorityBadgeText('2026-10-17T08:59:00Z', NOW)).toBeNull();
    expect(priorityBadgeText(null, NOW)).toBeNull();
    expect(priorityBadgeText('garbage', NOW)).toBeNull();
  });

  it('ends the shared message with the link and keeps the promise', () => {
    const message = invitationMessage('PROVIDER', 'https://example.com/r/K7M2QXA');
    expect(message.endsWith(' https://example.com/r/K7M2QXA')).toBe(true);
    expect(message).toContain('бесплатно и без посредников');
  });

  it('counts the friends who signed up', () => {
    expect(invitedLine(2)).toBe('По вашей ссылке зарегистрировались: 2');
    expect(invitedLine(0)).toBe('По вашей ссылке пока никто не зарегистрировался.');
    expect(invitedLine(null)).toBeNull();
  });
});
