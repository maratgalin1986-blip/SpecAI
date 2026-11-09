import { describe, expect, it } from 'vitest';
import { siteLeadConsentLabel } from './siteLeadText';

describe('siteLeadConsentLabel', () => {
  it('consent to the company itself: the data and the purpose', () => {
    const text = siteLeadConsentLabel(' Стоматология «Улыбка» ');
    expect(text).toBe(
      'Даю согласие компании Стоматология «Улыбка» на обработку моих имени, телефона и комментария, ' +
        'чтобы со мной связались по этой заявке',
    );
    expect(text).not.toMatch(/ИИСтройка24|передач/);
  });

  it('берёт название без кавычек в «ёлочки», уже закавыченное не дублирует', () => {
    expect(siteLeadConsentLabel('Дента')).toMatch(/^Даю согласие компании «Дента» на обработку/);
    expect(siteLeadConsentLabel('ООО "Дента"')).toMatch(
      /^Даю согласие компании ООО "Дента" на обработку/,
    );
  });
});
