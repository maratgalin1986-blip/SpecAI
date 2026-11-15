// Пауза рассылки по решению владельца (2026-11-15: «останови рассылку писем на двое суток, работай
// только с входящими»). Живёт в коде, а не в настройке офиса: чтобы остановить рассылку, не нужен
// вход в админку, и пауза сама заканчивается в срок. Поиск фирм и чтение ответов на письма идут
// как обычно; ответы фирмам на их письма — тоже (это не рассылка).
export const OUTREACH_PAUSED_FROM = new Date('2026-11-15T00:00:00Z');
export const OUTREACH_PAUSED_UNTIL = new Date('2026-11-17T07:30:00Z');

/** Идёт ли сейчас пауза рассылки владельца. */
export function outreachPausedByOwner(now: Date): boolean {
  return (
    now.getTime() >= OUTREACH_PAUSED_FROM.getTime() &&
    now.getTime() < OUTREACH_PAUSED_UNTIL.getTime()
  );
}
