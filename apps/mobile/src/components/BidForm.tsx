import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Button, Chip, Input } from '@/components/ui';
import { ApiError, createBid, type Equipment, type Order } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { orderDays, priceByRate } from '@/lib/orderFlow';
import { colors, spacing } from '@/theme';

/**
 * «Предложить цену» по заявке (POST /api/orders/[id]/bids). Одно предложение
 * от компании на заявку: повтор обновляет ожидающее. Подставляет технику той же
 * категории и цену по прайсу (смена × дни) как подсказку.
 */
export function BidForm({
  order,
  equipment,
  onSubmitted,
  onCancel,
}: {
  order: Order;
  /** Только свободная техника (сервер не примет занятую). */
  equipment: Equipment[];
  onSubmitted: (orderId: string) => void;
  onCancel: () => void;
}) {
  const existing = order.bids.find((bid) => bid.status === 'PENDING');
  const sameCategory = equipment.find((item) => item.category.id === order.category?.id);
  const [equipmentId, setEquipmentId] = useState(
    existing && equipment.some((item) => item.id === existing.equipmentId)
      ? existing.equipmentId
      : (sameCategory?.id ?? equipment[0]?.id ?? ''),
  );
  const [price, setPrice] = useState(existing ? String(Number(existing.price)) : '');
  const [message, setMessage] = useState(existing?.message ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = equipment.find((item) => item.id === equipmentId);
  const days = orderDays(order.desiredStartDate, order.desiredEndDate);
  const suggested = selected ? priceByRate(selected.dailyRate, days) : 0;

  const handleSubmit = async () => {
    setError(null);
    if (!equipmentId) return setError('Выберите технику');
    const amount = Number(price.replace(',', '.').replace(/\s/g, ''));
    if (!price.trim() || Number.isNaN(amount) || amount <= 0) {
      return setError('Укажите цену (число больше нуля)');
    }
    setSubmitting(true);
    try {
      const result = await createBid(order.id, {
        equipmentId,
        price: amount,
        message: message.trim() || undefined,
      });
      Alert.alert(
        result.message ?? 'Предложение отправлено',
        existing
          ? 'Заказчик увидит новую цену в заявке.'
          : 'Заказчик получит уведомление и сравнит предложения.',
      );
      onSubmitted(order.id);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось отправить предложение');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.form}>
      {existing ? (
        <Text style={styles.notice}>
          Вы уже предложили {formatMoney(existing.price, existing.currency)} — можно изменить.
        </Text>
      ) : null}
      <Text style={styles.label}>Техника</Text>
      {equipment.length === 0 ? (
        <Text style={styles.hint}>
          Нет свободной техники — добавьте машину или отметьте её «Свободна» во вкладке «Техника».
        </Text>
      ) : (
        <View style={styles.chips}>
          {equipment.map((item) => (
            <Chip
              key={item.id}
              label={item.name}
              selected={item.id === equipmentId}
              onPress={() => setEquipmentId(item.id)}
            />
          ))}
        </View>
      )}
      <Input
        label={`Цена за весь заказ${selected ? `, ${selected.currency}` : ''}`}
        value={price}
        onChangeText={setPrice}
        placeholder={suggested ? String(suggested) : '0'}
        keyboardType="decimal-pad"
      />
      {suggested && !price ? (
        <Chip
          label={`По прайсу: ${formatMoney(suggested, selected?.currency)}`}
          onPress={() => setPrice(String(suggested))}
          accessibilityLabel="Подставить цену по прайсу"
        />
      ) : null}
      <Input
        label="Сообщение заказчику"
        value={message}
        onChangeText={setMessage}
        placeholder="Подача, оператор, когда сможете приехать…"
        multiline
        numberOfLines={3}
        style={styles.textarea}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        <View style={styles.flex}>
          <Button title="Отмена" variant="secondary" onPress={onCancel} disabled={submitting} />
        </View>
        <View style={styles.flex}>
          <Button
            title={existing ? 'Обновить' : 'Отправить'}
            loading={submitting}
            disabled={equipment.length === 0}
            onPress={() => void handleSubmit()}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  form: {
    gap: spacing.md,
    marginTop: spacing.xs,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  notice: { fontSize: 14, color: colors.primaryDark, fontWeight: '600' },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  hint: { fontSize: 13, color: colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  textarea: { minHeight: 80, paddingTop: spacing.md, textAlignVertical: 'top' },
  error: { color: colors.danger, fontSize: 14 },
  actions: { flexDirection: 'row', gap: spacing.sm },
});
