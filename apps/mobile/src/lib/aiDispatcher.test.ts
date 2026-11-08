import { describe, expect, it } from 'vitest';
import {
  AI_ENTRY_HINT,
  AI_ENTRY_TITLE,
  AI_TYPING,
  AI_UNAVAILABLE,
  aiDispatcherGreeting,
  aiDispatcherTitle,
} from './aiDispatcher';

describe('AI dispatcher label', () => {
  const site = {
    name: 'ИИСтройка24',
    phone: '+7 (927) 242-80-88',
    workingHours: 'Пн–Сб, 8:00–20:00',
  };

  it('introduces itself as a program, not a person, and names a human to call', () => {
    expect(aiDispatcherGreeting(site)).toBe(
      'ИИ-диспетчер ИИСтройка24 — я программа, не человек. ' +
        'Опишите задачу: что сделать, где и когда — подберу технику и назову цену. ' +
        'Живой диспетчер — по телефону +7 (927) 242-80-88 (Пн–Сб, 8:00–20:00).',
    );
    expect(aiDispatcherTitle(site.name)).toBe('ИИ-диспетчер ИИСтройка24');
  });

  it('labels the home entry and the chat states as AI', () => {
    expect(AI_ENTRY_TITLE).toBe('Спросить ИИ-диспетчера');
    expect(AI_ENTRY_HINT).toBe('Подберу технику и цену за минуту');
    expect(AI_TYPING.startsWith('ИИ-диспетчер')).toBe(true);
    expect(AI_UNAVAILABLE.startsWith('ИИ-диспетчер')).toBe(true);
  });
});
