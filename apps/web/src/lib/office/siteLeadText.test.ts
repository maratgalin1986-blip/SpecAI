import { describe, expect, it } from 'vitest';
import { siteLeadConsentLabel } from './siteLeadText';

describe('siteLeadConsentLabel', () => {
  it('consent to the company itself: the data and the purpose', () => {
    const text = siteLeadConsentLabel(' Стоматология «Улыбка» ');
    expect(text).toBe(
      'Даю согласие Стоматология «Улыбка» на обработку моих имени, телефона и комментария, ' +
        'чтобы со мной связались по этой заявке',
    );
    expect(text).not.toMatch(/ИИСтройка24|передач/);
  });
});
