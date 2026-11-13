import { describe, expect, it } from 'vitest';
import { AGENTS } from './agents';
import { nichesOf } from './niches';
import { buildEmail } from './outreach';
import { nichePitch, PITCH_NICHES } from './pitch';

// Первое письмо и презентация — без цен, сроков и обещаний результата (К6).
const FORBIDDEN = /₽|руб|гарант|лучш|сам(ый|ая|ое|ые)\s|за \d+ (дн|час)|бесплатно/i;

describe('предложение по сфере фирмы', () => {
  it('у каждой ниши офиса есть своё предложение', () => {
    // Презентация — про сайт: она нужна нишам «Сайтов» и спецтехнике (на ней пробное письмо
    // владельцу). Остальным нишам проекта площадки сайт не предлагаем.
    for (const niche of nichesOf('sites')) expect(PITCH_NICHES).toContain(niche.key);
    expect(PITCH_NICHES).toContain('machinery');
    for (const key of AGENTS.sites.defaultNiches) expect(PITCH_NICHES).toContain(key);
  });

  it('в каждом — от двух до четырёх сцен, первая про сайт, без цен и обещаний', () => {
    for (const key of [...PITCH_NICHES, 'неизвестная']) {
      const pitch = nichePitch(key);
      expect(pitch.scenes.length).toBeGreaterThanOrEqual(2);
      expect(pitch.scenes.length).toBeLessThanOrEqual(4);
      expect(pitch.scenes[0]?.kind).toBe('site');
      const text = [
        pitch.headline,
        pitch.letterLine,
        ...pitch.scenes.flatMap((s) => [s.title, s.text, ...s.labels]),
      ].join(' ');
      expect(text).not.toMatch(FORBIDDEN);
      for (const scene of pitch.scenes) {
        expect(scene.labels.length).toBeGreaterThanOrEqual(scene.kind === 'camera' ? 2 : 3);
      }
    }
  });

  it('лишнего не предлагаем: юристу — без камер, автомойке — с камерами', () => {
    expect(nichePitch('lawyer').scenes.map((s) => s.kind)).not.toContain('camera');
    expect(nichePitch('car_wash').scenes.map((s) => s.kind)).toContain('camera');
    expect(nichePitch('car_repair').letterLine).toContain('запись');
  });
});

describe('письмо с презентацией', () => {
  const site = {
    kind: 'site' as const,
    status: 'READY',
    slug: 'moyka-kazan',
    name: 'Автомойка «Блеск»',
    phone: '+78435551234',
    address: 'ул. Мира, 1',
    city: 'Казань',
    lat: null,
    lon: null,
    tags: null,
    hours: null,
    email: 'a@mail.ru',
  };
  const base = 'https://xn--24-6kc5aagh4arjl.xn--p1ai';
  const input = {
    previewUrl: `${base}/preview/tok`,
    baseUrl: base,
    prices: { setup: 15000, monthly: 1500 },
    nicheTitle: 'Автомойка',
    replyTo: '',
    showUrl: `${base}/pokaz/tok`,
    pitchLine: nichePitch('car_wash').letterLine,
  };

  it('кнопка обложки ведёт на презентацию, в тексте — фраза по сфере и ссылка', () => {
    const letter = buildEmail(site, input);
    expect(letter.html).toContain(`<a href="${base}/pokaz/tok"`);
    expect(letter.html).toContain('Смотреть презентацию');
    expect(letter.html).toContain(`<a href="${input.previewUrl}"`);
    expect(letter.text).toContain(input.pitchLine);
    expect(letter.text).toContain(
      `Презентация и 3D-город — пример нашей работы: ${base}/pokaz/tok`,
    );
    expect(letter.text).toContain('3D-город');
    expect(letter.text).not.toMatch(/₽|руб\./);
  });

  it('письмо исполнителю техники презентацию сайтов не получает', () => {
    const letter = buildEmail({ ...site, kind: 'provider' }, input);
    expect(letter.html).not.toContain('Смотреть презентацию');
  });
});
