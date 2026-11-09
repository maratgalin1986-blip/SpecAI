import { describe, expect, it, vi } from 'vitest';

vi.mock('@specai/ai-service', () => ({ DEFAULT_MODEL: 'test', getAnthropicClient: () => null }));

import { buildDossier } from './dossier';
import { angleLeader, learningTable, type AngleStat } from './learning';
import { buildOffer, type OfferAngle } from './offer';
import { adminOfferView } from './offerView';
import type { Candidate } from './sources/types';

const cand: Candidate = {
  name: 'Улыбка',
  phone: '+78432000001',
  address: 'ул. Баумана, 10',
  lat: 55.79,
  lon: 49.11,
  hours: 'Mo-Fr 09:00-21:00',
  website: null,
  email: null,
  whatsapp: null,
  telegram: null,
  tags: [],
  sourceRef: 'osm:node/1',
};

const dossier = buildDossier({
  candidate: cand,
  neighbors: [],
  niche: 'dentist',
  nicheTitle: 'Стоматология',
  city: 'Казань',
});

describe('adminOfferView', () => {
  it('письма ещё не было — предложение с первым подходящим заходом', () => {
    const view = adminOfferView({
      name: 'Улыбка',
      dossierJson: JSON.stringify(dossier),
      offerJson: null,
    });
    expect(view.sent).toBe(false);
    expect(view.ai).toBe(false);
    expect(view.dossier?.city).toBe('Казань');
    expect(view.offer.angle).toBe('open_late');
    expect(view.offer).toEqual(
      buildOffer({ dossier: view.dossier, angle: view.offer.angle, companyName: 'Улыбка' }),
    );
  });

  it('письмо ушло — показываем как ушло, с отметкой ИИ', () => {
    const sent = {
      ...buildOffer({ dossier, angle: 'open_late', companyName: 'Улыбка' }),
      opener: 'Переписано',
      ai: true,
    };
    const view = adminOfferView({
      name: 'Улыбка',
      dossierJson: JSON.stringify(dossier),
      offerJson: JSON.stringify(sent),
    });
    expect(view.sent).toBe(true);
    expect(view.ai).toBe(true);
    expect(view.offer.opener).toBe('Переписано');
    expect(view.offer).not.toHaveProperty('ai');
  });

  it('битые досье и предложение — общий заход без досье', () => {
    const view = adminOfferView({ name: 'Улыбка', dossierJson: '{', offerJson: '{"angle":1}' });
    expect(view.dossier).toBeNull();
    expect(view.sent).toBe(false);
    expect(view.offer.angle).toBe('leads_to_email');
  });
});

describe('angleLeader', () => {
  const stat = (angle: OfferAngle, sent: number, opened = 0, replied = 0): AngleStat => ({
    angle,
    sent,
    opened,
    replied,
    agreed: 0,
  });

  it('нет писем или откликов — лидера нет', () => {
    expect(angleLeader(learningTable(new Map()))).toBeNull();
    expect(angleLeader(learningTable(new Map([['search', stat('search', 8)]])))).toBeNull();
  });

  it('лидер — лучший по оценке среди заходов с письмами и откликами', () => {
    const table = learningTable(
      new Map<OfferAngle, AngleStat>([
        ['search', stat('search', 10, 1)],
        ['open_late', stat('open_late', 9, 4, 2)],
      ]),
    );
    expect(angleLeader(table)?.angle).toBe('open_late');
  });
});
