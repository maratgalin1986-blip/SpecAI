import { describe, expect, it } from 'vitest';
import {
  REFERRAL_CODE_LENGTH,
  colleaguesLabel,
  generateReferralCode,
  invitationText,
  normalizeReferralCode,
  recommendsNote,
  referralLanding,
  referralLink,
} from './referral';
import { SHARE_NETWORKS, shareUrl, withShareUtm } from './share';

describe('referral codes', () => {
  it('generates codes of the fixed length without look-alike characters', () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateReferralCode();
      expect(code).toHaveLength(REFERRAL_CODE_LENGTH);
      expect(code).not.toMatch(/[01OIL]/);
      expect(normalizeReferralCode(code)).toBe(code);
    }
  });

  it('is deterministic for a given random source and stays in range at the edges', () => {
    expect(generateReferralCode(() => 0)).toBe('AAAAAAA');
    expect(generateReferralCode(() => 0.999999)).toBe('9999999');
  });

  it('normalizes input from links and rejects anything else', () => {
    expect(normalizeReferralCode('  k7m2qxa ')).toBe('K7M2QXA');
    expect(normalizeReferralCode('K7M2QX')).toBeNull();
    expect(normalizeReferralCode('K7M2QX0')).toBeNull();
    expect(normalizeReferralCode('<script>')).toBeNull();
    expect(normalizeReferralCode(42)).toBeNull();
    expect(normalizeReferralCode(null)).toBeNull();
  });

  it('builds the short link and the sign-up landing with UTM tags', () => {
    expect(referralLink('https://spec-ai-web.vercel.app/', 'K7M2QXA')).toBe(
      'https://spec-ai-web.vercel.app/r/K7M2QXA',
    );
    expect(referralLanding('K7M2QXA')).toBe(
      '/register?ref=K7M2QXA&utm_source=referral&utm_medium=invite',
    );
    expect(referralLanding('K7M2QXA', true)).toContain('type=provider');
  });

  it('writes the «Рекомендует» note only for real invitations', () => {
    expect(recommendsNote(0)).toBeNull();
    expect(recommendsNote(Number.NaN)).toBeNull();
    expect(recommendsNote(1)).toBe('Рекомендует сервис: пригласил 1 коллегу');
    expect(recommendsNote(3)).toBe('Рекомендует сервис: пригласил 3 коллег');
    expect(colleaguesLabel(21)).toBe('21 коллегу');
    expect(colleaguesLabel(11)).toBe('11 коллег');
  });

  it('has an invitation text for both roles without money promises', () => {
    for (const role of ['CUSTOMER', 'PROVIDER'] as const) {
      expect(invitationText(role)).toMatch(/СпецПласт16/);
      expect(invitationText(role)).not.toMatch(/₽|бонус|скидк/i);
    }
  });
});

describe('share links', () => {
  const url = 'https://spec-ai-web.vercel.app/equipment/sp16-1';

  it('adds share UTM tags once and keeps existing ones', () => {
    expect(withShareUtm(url, 'vk')).toBe(`${url}?utm_source=vk&utm_medium=share`);
    const tagged = `${url}?utm_source=avito&utm_medium=ads`;
    expect(withShareUtm(tagged, 'vk')).toBe(tagged);
    expect(withShareUtm('not a url', 'vk')).toBe('not a url');
  });

  it('builds a link for each network', () => {
    expect(SHARE_NETWORKS.map((n) => n.id)).toEqual(['telegram', 'whatsapp', 'vk']);
    expect(shareUrl('telegram', url, 'Экскаватор')).toMatch(/^https:\/\/t\.me\/share\/url\?url=/);
    expect(shareUrl('whatsapp', url, 'Экскаватор')).toMatch(/^https:\/\/wa\.me\/\?text=/);
    expect(shareUrl('vk', url, 'Экскаватор')).toMatch(/^https:\/\/vk\.com\/share\.php\?url=/);
    expect(decodeURIComponent(shareUrl('telegram', url, 'X'))).toContain('utm_source=telegram');
  });

  it('leaves invitation links untouched when tagging is off', () => {
    const link = 'https://spec-ai-web.vercel.app/r/K7M2QXA';
    expect(decodeURIComponent(shareUrl('whatsapp', link, 'Привет', false))).toBe(
      `https://wa.me/?text=Привет ${link}`,
    );
  });
});
