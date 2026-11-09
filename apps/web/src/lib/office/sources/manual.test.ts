import { describe, expect, it } from 'vitest';
import { parseManualLines } from './manual';

describe('parseManualLines', () => {
  it('разбирает строки с разными разделителями', () => {
    const text = [
      'Стоматология «Улыбка»; 8 (843) 123-45-67; ул. Баумана, 10, Казань',
      '',
      'Автосервис у Марата | +7 917 000-00-01 | Набережные Челны',
      'Шиномонтаж\t89170000002\tв Казани',
      'Салон красоты «Ева»; 8 917 000 00 03',
      'Ветклиника «Айболит»; 8 843 222-33-44; Казань; Vet@Aibolit.Example; 8 917 000 00 04',
    ].join('\n');
    const { candidates, errors } = parseManualLines(text);
    expect(errors).toEqual([]);
    expect(candidates).toHaveLength(5);

    expect(candidates[0]).toEqual({
      name: 'Стоматология «Улыбка»',
      phone: '+78431234567',
      address: 'ул. Баумана, 10, Казань',
      lat: null,
      lon: null,
      hours: null,
      website: null,
      email: null,
      whatsapp: null,
      telegram: null,
      tags: [],
      sourceRef: 'manual:+78431234567',
    });
    expect(candidates[1]!.name).toBe('Автосервис у Марата');
    expect(candidates[1]!.lat).toBeNull(); // центр города — не адрес компании: карта пойдёт по адресу
    expect(candidates[2]!.phone).toBe('+79170000002');
    expect(candidates[2]!.address).toBe('в Казани');
    expect(candidates[3]!.address).toBeNull();
    expect(candidates[3]!.lat).toBeNull();
    expect(candidates[4]).toMatchObject({
      name: 'Ветклиника «Айболит»',
      phone: '+78432223344',
      lat: null,
      email: 'vet@aibolit.example',
      whatsapp: '+79170000004',
      telegram: null,
    });
  });

  it('сообщает об ошибках по-русски с номером строки', () => {
    const text = [
      'Стоматологии без номера; ; Казань',
      '; 8 917 000 00 01; Казань',
      'Дубль; 8 917 000 00 05',
      'Ещё дубль; +7 917 000-00-05',
      'Короткий номер; 12345',
      'Плохая почта; 8 917 000 00 06; Казань; не-почта',
      'Плохой WhatsApp; 8 917 000 00 07; Казань; ok@mail.ru; abc',
    ].join('\n');
    const { candidates, errors } = parseManualLines(text);
    expect(candidates.map((c) => c.name)).toEqual(['Дубль']);
    expect(errors).toEqual([
      'Строка 1: нет телефона',
      'Строка 2: нет названия',
      'Строка 4: телефон +79170000005 уже есть выше',
      'Строка 5: нет телефона',
      'Строка 6: непонятная почта «не-почта»',
      'Строка 7: непонятный WhatsApp «abc»',
    ]);
  });

  it('пустой текст — пусто', () => {
    expect(parseManualLines('\n  \n')).toEqual({ candidates: [], errors: [] });
  });
});
