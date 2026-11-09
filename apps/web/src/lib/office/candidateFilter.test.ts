import { describe, expect, it } from 'vitest';
import {
  CANDIDATE_SKIP_REASONS,
  candidateSkipReason,
  candidateSkipText,
  looksLikeEntrepreneur,
  looksLikePersonName,
} from './candidateFilter';

describe('candidateFilter: ИП (К5)', () => {
  it.each([
    'ИП Иванова А.А.',
    'ИП Петров',
    'ип Сидоров',
    'И.П. Козлов',
    'И. П. Козлов',
    '«ИП Ахметов»',
    'Индивидуальный предприниматель Смирнов',
    'Шиномонтаж (ИП Гарипов)',
    'Цветы, ИП Сидорова',
    'Салон красоты, ОГРНИП 304165000000000',
  ])('«%s» — ИП', (name) => {
    expect(looksLikeEntrepreneur(name)).toBe(true);
    expect(candidateSkipReason(name)).toBe('entrepreneur');
  });

  it.each([
    'Ипподром',
    'ИПК Строитель',
    'Автосервис Гараж',
    'ООО «Типография»',
    'Шиномонтаж на Ипподромной',
    '',
  ])('«%s» — не ИП', (name) => {
    expect(looksLikeEntrepreneur(name)).toBe(false);
  });
});

describe('candidateFilter: похоже на ФИО (К5)', () => {
  it.each([
    'Иванов Иван Иванович',
    'Иван Иванович Иванов',
    'Ольга Петровна',
    'Сидорова Анна Сергеевна',
    'Гарипова Алия Ильинична',
    'Римский-Корсаков Николай Андреевич',
    'Иванова А. Б.',
    'Иванова А.Б.',
    'А. Б. Иванова',
  ])('«%s» — человек', (name) => {
    expect(looksLikePersonName(name)).toBe(true);
    expect(candidateSkipReason(name)).toBe('person');
  });

  it.each([
    'Стоматология Улыбка',
    'Автосервис Петрович',
    'Кафе Михалыч Петрович',
    'Шиномонтаж',
    'Салон Анна',
    'Кран-Сервис',
    'ООО Иванович',
    'Иванов и партнёры',
    'Иванов Иван',
    'Мастерская Ивановича',
    'Вкусно и точка',
  ])('«%s» — не человек', (name) => {
    expect(looksLikePersonName(name)).toBe(false);
    expect(candidateSkipReason(name)).toBeNull();
  });
});

describe('candidateSkipText', () => {
  it('строка пропуска: «<название>: <причина>»', () => {
    expect(candidateSkipText('ИП Петров')).toBe(
      `ИП Петров: ${CANDIDATE_SKIP_REASONS.entrepreneur}`,
    );
    expect(candidateSkipText('Ольга Петровна')).toBe(
      `Ольга Петровна: ${CANDIDATE_SKIP_REASONS.person}`,
    );
    expect(candidateSkipText('Автомойка Блеск')).toBeNull();
  });
});
