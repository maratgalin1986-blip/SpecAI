/**
 * Подписи ИИ-диспетчера (вкладка «Помощник», POST /api/ai/agents). Правило
 * владельца: всё автоматическое подписано как автоматическое — диспетчер
 * сразу говорит, что он программа, а не человек, и где найти живого.
 * Чистый модуль (без SITE: тот тянет api.ts) — покрыт тестом.
 */

/** Короткое имя в шапке экрана и на кнопке. */
export const AI_DISPATCHER_NAME = 'ИИ-диспетчер';

/** Шапка экрана чата: «ИИ-диспетчер ИИСтройка24». */
export function aiDispatcherTitle(platform: string): string {
  return `${AI_DISPATCHER_NAME} ${platform}`;
}

/** Первое сообщение чата: кто отвечает и как связаться с человеком. */
export function aiDispatcherGreeting(site: {
  name: string;
  phone: string;
  workingHours: string;
}): string {
  return (
    `${aiDispatcherTitle(site.name)} — я программа, не человек. ` +
    'Опишите задачу: что сделать, где и когда — подберу технику и назову цену. ' +
    `Живой диспетчер — по телефону ${site.phone} (${site.workingHours}).`
  );
}

/** Кнопка на главной заказчика. */
export const AI_ENTRY_TITLE = 'Спросить ИИ-диспетчера';
export const AI_ENTRY_HINT = 'Подберу технику и цену за минуту';

/** Пока ответ не пришёл. */
export const AI_TYPING = 'ИИ-диспетчер пишет…';
/** Ответ не пришёл. */
export const AI_UNAVAILABLE = 'ИИ-диспетчер сейчас недоступен — позвоните нам';
