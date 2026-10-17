import { describe, expect, it } from 'vitest';
import { matchedOrderCancelError } from './orderCancel';

describe('matchedOrderCancelError', () => {
  it('sends the customer to the booking while it can still be cancelled', () => {
    for (const status of ['PENDING', 'CONFIRMED', null, undefined]) {
      const text = matchedOrderCancelError(status);
      expect(text).toContain('отмените бронь');
      // The app has no «личный кабинет»; the text names neither site nor app.
      expect(text).not.toMatch(/кабинет|вкладк|сайт|приложен/i);
    }
  });

  it('says plainly when nothing can be cancelled any more', () => {
    expect(matchedOrderCancelError('ACTIVE')).toBe(
      'Работы по заявке уже идут — отменить её нельзя',
    );
    expect(matchedOrderCancelError('COMPLETED')).toBe('Заказ уже выполнен — отменить нельзя');
  });
});
