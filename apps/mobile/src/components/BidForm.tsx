import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Button, Chip, Input } from '@/components/ui';
import { ApiError, createBid, type Equipment, type Order } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { orderDays, priceByRate } from '@/lib/orderFlow';
import { bidTotal, parseAmount } from '@/lib/providerFeed';
import { colors, spacing } from '@/theme';

/**
 * «Предложить цену» по заявке (POST /api/orders/[id]/bids). Одно предложение
 * от компании на заявку: повтор обновляет ожидающее. Цена складывается из
 * подачи (подставляется по расстоянию × цена за км), цены смены (по прайсу
 * машины) и числа смен (дни заявки); итог считается сам, сервер проверяет
 * сумму. Без цены смены итог вводится вручную, как раньше.
 */
export function BidForm({
  order,
  equipment,
  suggestedDelivery,
  onSubmitted,
  onCancel,
}: {
  order: Order;
  /** Только свободная техника (сервер не примет занятую). */
  equipment: Equipment[];
  /** Подача по расстоянию × цена за км компании; null — неизвестна. */
  suggestedDelivery?: number | null;
  onSubmitted: (orderId: string) => void;
  onCancel: () => void;
}) {
  const existing = order.bids.find((bid) => bid.status === 'PENDING');
  const sameCategory = equipment.find((item) => item.category.id === order.category?.id);
  const days = orderDays(order.desiredStartDate, order.desiredEndDate);
  const [equipmentId, setEquipmentId] = useState(
    existing && equipment.some((item) => item.id === existing.equipmentId)
      ? existing.equipmentId
      : (sameCategory?.id ?? equipment[0]?.id ?? ''),
  );
  const [delivery, setDelivery] = useState(
    existing?.deliveryPrice != null
      ? String(Number(existing.deliveryPrice))
      : suggestedDelivery != null
        ? String(suggestedDelivery)
        : '',
  );
  const [shiftPrice, setShiftPrice] = useState(
    existing?.shiftPrice != null ? String(Number(existing.shiftPrice)) : '',
  );
  const [shifts, setShifts] = useState(String(existing?.shifts ?? days));
  const [price, setPrice] = useState(existing ? String(Number(existing.price)) : '');
  const [optionsNote, setOptionsNote] = useState(existing?.optionsNote ?? '');
  const [message, setMessage] = useState(existing?.message ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = equipment.find((item) => item.id === equipmentId);
  const suggested = selected ? priceByRate(selected.dailyRate, days) : 0;
  const shiftValue = parseAmount(shiftPrice);
  const shiftsValue = Math.max(1, Math.round(parseAmount(shifts) || 1));
  const deliveryValue = delivery.trim() === '' ? 0 : parseAmount(delivery);
  const hasBreakdown = shiftValue > 0;
  const total = hasBreakdown ? bidTotal(deliveryValue || 0, shiftValue, shiftsValue) : null;

  useEffect(() => {
    if (total !== null) setPrice(String(total));
  }, [total]);

  const handleSubmit = async () => {
    setError(null);
    if (!equipmentId) return setError('Выберите технику');
    const amount = parseAmount(price);
    if (!price.trim() || Number.isNaN(amount) || amount <= 0) {
      return setError('Укажите цену (число больше нуля)');
    }
    if (delivery.trim() && (Number.isNaN(deliveryValue) || deliveryValue < 0)) {
      return setError('Подача — число не меньше нуля');
    }
    setSubmitting(true);
    try {
      const result = await createBid(order.id, {
        equipmentId,
        price: amount,
        message: message.trim() || undefined,
        ...(hasBreakdown
          ? { deliveryPrice: deliveryValue || 0, shiftPrice: shiftValue, shifts: shiftsValue }
          : delivery.trim()
            ? { deliveryPrice: deliveryValue || 0 }
            : {}),
        optionsNote: optionsNote.trim() || undefined,
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

      <Text style={styles.label}>Из чего складывается цена</Text>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Input
            label="Подача"
            value={delivery}
            onChangeText={setDelivery}
            placeholder="0"
            keyboardType="decimal-pad"
          />
        </View>
        <View style={styles.flex}>
          <Input
            label="Смена"
            value={shiftPrice}
            onChangeText={setShiftPrice}
            placeholder={selected ? String(Math.round(Number(selected.dailyRate))) : '0'}
            keyboardType="decimal-pad"
          />
        </View>
        <View style={styles.shifts}>
          <Input
            label="Смен"
            value={shifts}
            onChangeText={setShifts}
            keyboardType="number-pad"
            maxLength={3}
          />
        </View>
      </View>
      <View style={styles.chips}>
        {selected && !shiftPrice ? (
          <Chip
            label={`Смена по прайсу: ${formatMoney(selected.dailyRate, selected.currency)}`}
            onPress={() => setShiftPrice(String(Math.round(Number(selected.dailyRate))))}
            accessibilityLabel="Подставить цену смены по прайсу"
          />
        ) : null}
        {suggestedDelivery != null && delivery !== String(suggestedDelivery) ? (
          <Chip
            label={`Подача по км: ${formatMoney(suggestedDelivery, selected?.currency)}`}
            onPress={() => setDelivery(String(suggestedDelivery))}
            accessibilityLabel="Подставить подачу по расстоянию"
          />
        ) : null}
      </View>

      <Input
        label={`Итого за весь заказ${selected ? `, ${selected.currency}` : ''}`}
        value={price}
        onChangeText={setPrice}
        editable={!hasBreakdown}
        placeholder={suggested ? String(suggested) : '0'}
        keyboardType="decimal-pad"
        style={hasBreakdown ? styles.computed : undefined}
      />
      {hasBreakdown ? (
        <Text style={styles.hint}>
          {formatMoney(deliveryValue || 0, selected?.currency)} подача +{' '}
          {formatMoney(shiftValue, selected?.currency)} × {shiftsValue} ={' '}
          {formatMoney(total ?? 0, selected?.currency)}
        </Text>
      ) : suggested && !price ? (
        <Chip
          label={`По прайсу: ${formatMoney(suggested, selected?.currency)}`}
          onPress={() => setPrice(String(suggested))}
          accessibilityLabel="Подставить цену по прайсу"
        />
      ) : null}
      <Input
        label="Опции (необязательно)"
        value={optionsNote}
        onChangeText={setOptionsNote}
        placeholder="Гидромолот, второй машинист, ночная смена…"
        maxLength={300}
      />
      <Input
        label="Сообщение заказчику"
        value={message}
        onChangeText={setMessage}
        placeholder="Когда сможете приехать, опыт на похожих объектах…"
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
  row: { flexDirection: 'row', gap: spacing.sm },
  shifts: { width: 84 },
  computed: { backgroundColor: colors.surfaceMuted, fontWeight: '700' },
  textarea: { minHeight: 80, paddingTop: spacing.md, textAlignVertical: 'top' },
  error: { color: colors.danger, fontSize: 14 },
  actions: { flexDirection: 'row', gap: spacing.sm },
});
