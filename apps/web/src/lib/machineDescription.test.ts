import { describe, expect, it } from 'vitest';
import { machineDescription, THIN_DESCRIPTION } from './machineDescription';

describe('machineDescription', () => {
  it('keeps a full description as it is', () => {
    const text =
      'Экскаватор-погрузчик с оператором: копка, засыпка, погрузка сыпучих материалов и планировка.';
    expect(
      machineDescription({ name: 'CASE 570', categoryName: 'Экскаваторы', description: text }),
    ).toBe(text);
  });

  it('completes a thin one from the card: model, specs, price, city — nothing invented', () => {
    const out = machineDescription({
      name: 'Каток Bomag BW 120',
      categoryName: 'Катки',
      description: 'Виброкаток с машинистом: уплотнение грунта, щебня и асфальта.',
      year: 2019,
      specs: { 'Масса, т': 2.7, 'Цена, ₽/ч': 3000, Барабан: 'гладкий' },
      price: 'от 3 000 ₽/ч',
      city: 'Набережные Челны',
    });
    expect(out.length).toBeGreaterThanOrEqual(THIN_DESCRIPTION);
    expect(out).toBe(
      'Виброкаток с машинистом: уплотнение грунта, щебня и асфальта. ' +
        'Каток Bomag BW 120, 2019 г. выпуска, Масса 2,7 т, Барабан: гладкий. ' +
        'Аренда от 3 000 ₽/ч с машинистом. Набережные Челны.',
    );
    // Prices stay in the price sentence, not repeated from the specs.
    expect(out).not.toContain('Цена');
  });

  it('builds a text when the card has none', () => {
    const out = machineDescription({
      name: 'КС-55716',
      categoryName: 'Автокраны',
      description: null,
      price: 'от 4 000 ₽/ч',
    });
    expect(out).toBe('Аренда: КС-55716, автокраны с машинистом. Аренда от 4 000 ₽/ч с машинистом.');
  });
});
