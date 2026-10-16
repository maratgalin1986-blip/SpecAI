import { describe, expect, it } from 'vitest';
import {
  filterLeads,
  leadFilterCounts,
  leadSourceLabel,
  parseLeadFilter,
  sortLeads,
} from './adminLeads';

const at = (day: number) => new Date(`2026-10-${String(day).padStart(2, '0')}T10:00:00Z`);
const leads = [
  { id: 'done-new', status: 'DONE', createdAt: at(12) },
  { id: 'new-old', status: 'NEW', createdAt: at(1) },
  { id: 'work', status: 'IN_PROGRESS', createdAt: at(11) },
  { id: 'new-fresh', status: 'NEW', createdAt: at(10) },
];

describe('admin leads', () => {
  it('puts new leads first, newest first inside a status', () => {
    expect(sortLeads(leads).map((lead) => lead.id)).toEqual([
      'new-fresh',
      'new-old',
      'work',
      'done-new',
    ]);
  });

  it('filters by status and counts each filter', () => {
    expect(filterLeads(leads, 'new').map((lead) => lead.id)).toEqual(['new-old', 'new-fresh']);
    expect(filterLeads(leads, 'all')).toHaveLength(4);
    expect(leadFilterCounts(leads)).toEqual({ all: 4, new: 2, work: 1, done: 1 });
  });

  it('reads the filter from the query', () => {
    expect(parseLeadFilter('new')).toBe('new');
    expect(parseLeadFilter(['done'])).toBe('done');
    expect(parseLeadFilter('junk')).toBe('all');
    expect(parseLeadFilter(undefined)).toBe('all');
  });

  it('labels the source the way the marketing table does', () => {
    expect(leadSourceLabel('home · Яндекс Директ')).toBe('Главная, форма звонка · Яндекс Директ');
    expect(leadSourceLabel('estimate:abc · Прямой заход')).toBe(
      'Расчёт на странице техники · Прямой заход',
    );
    expect(leadSourceLabel('yandex|hero')).toBe('Главная, форма звонка · Яндекс Директ');
    expect(leadSourceLabel('site|contacts')).toBe('Контакты · Сайт');
    expect(leadSourceLabel('contacts')).toBe('Контакты');
    expect(leadSourceLabel('telegram')).toBe('Telegram');
    expect(leadSourceLabel('')).toBeNull();
    expect(leadSourceLabel(null)).toBeNull();
  });
});
