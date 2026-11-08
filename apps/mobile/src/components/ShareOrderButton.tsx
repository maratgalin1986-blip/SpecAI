import React from 'react';
import { Share } from 'react-native';
import { Button } from '@/components/ui';
import { API_URL, type Order } from '@/lib/api';
import { orderShareMessage } from '@/lib/orderShare';

/**
 * «Поделиться заявкой» у автора открытой заявки: системное меню «Поделиться»
 * со ссылкой и фразой «Помогите найти технику: …» (lib/orderShare.ts).
 * Заказчик делится сам, когда хочет; приложение ничего не отправляет за него.
 */
export function ShareOrderButton({ order }: { order: Order }) {
  const share = () => {
    const message = orderShareMessage(
      {
        id: order.id,
        categoryName: order.category?.name,
        city: order.location?.city,
        desiredStartDate: order.desiredStartDate,
      },
      API_URL,
    );
    // Закрытое меню — не ошибка.
    void Share.share({ message }).catch(() => undefined);
  };
  return (
    <Button
      title="Поделиться заявкой"
      variant="secondary"
      accessibilityHint="Отправить ссылку на заявку знакомым или в рабочий чат"
      onPress={share}
    />
  );
}
