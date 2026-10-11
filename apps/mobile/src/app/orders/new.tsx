import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { DateField } from '@/components/DateField';
import { Button, Card, Chip, Input } from '@/components/ui';
import { ApiError, createOrder, fetchCategories, type Category } from '@/lib/api';
import { addDays, bookingDays, pluralizeRu, startOfDay, toIsoDate } from '@/lib/format';
import { categoryIcon } from '@/lib/orderFlow';
import { colors, spacing } from '@/theme';

export default function NewOrderScreen() {
  const router = useRouter();
  // Поля, заполненные на главном экране (шторка быстрого заказа).
  const params = useLocalSearchParams<{ categoryId?: string; address?: string }>();
  const today = useMemo(() => startOfDay(new Date()), []);
  const [description, setDescription] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(params.categoryId ?? null);
  const [address, setAddress] = useState(params.address ?? '');
  // По умолчанию — одна смена завтра.
  const [startDate, setStartDate] = useState(() => addDays(today, 1));
  const [endDate, setEndDate] = useState(() => addDays(today, 1));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchCategories()
      .then((data) => {
        if (!cancelled) setCategories(data.categories);
      })
      .catch(() => {
        // Категория необязательна — без списка заявку всё равно можно отправить.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleStartChange = (date: Date) => {
    const next = startOfDay(date);
    setStartDate(next);
    if (endDate < next) setEndDate(next);
  };

  // Days are counted inclusively, as for bookings: a one-day order is allowed.
  const days = bookingDays(startDate, endDate);

  const handleSubmit = async () => {
    Keyboard.dismiss();
    setError(null);
    if (!description.trim()) {
      setError('Опишите, какая техника нужна');
      return;
    }
    if (!days) {
      setError('Дата окончания не может быть раньше даты начала');
      return;
    }
    setSubmitting(true);
    try {
      const { order } = await createOrder({
        description: description.trim(),
        desiredStartDate: toIsoDate(startDate),
        desiredEndDate: toIsoDate(endDate),
        categoryId: categoryId ?? undefined,
        address: address.trim() || undefined,
      });
      router.replace({ pathname: '/orders/[id]', params: { id: order.id } });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось создать заявку');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 96 : 0}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Card style={styles.section}>
          <Input
            label="Что нужно"
            value={description}
            onChangeText={setDescription}
            placeholder="Например: нужен экскаватор для траншеи 50 м, мягкий грунт"
            multiline
            numberOfLines={4}
            maxLength={2000}
            style={styles.textarea}
            textAlignVertical="top"
          />
        </Card>

        <Card style={styles.section}>
          <Input
            label="Адрес объекта"
            value={address}
            onChangeText={setAddress}
            placeholder="Город, улица, дом или ориентир"
            maxLength={200}
          />
        </Card>

        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Категория</Text>
          <View style={styles.chips}>
            <Chip
              label="Любая"
              selected={categoryId === null}
              onPress={() => setCategoryId(null)}
            />
            {categories.map((category) => (
              <Chip
                key={category.id}
                label={`${categoryIcon(category.name)} ${category.name}`}
                accessibilityLabel={category.name}
                selected={categoryId === category.id}
                onPress={() => setCategoryId(category.id)}
              />
            ))}
          </View>
        </Card>

        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Желаемые даты</Text>
          <View style={styles.dateRow}>
            <View style={styles.dateField}>
              <DateField
                label="Начало"
                value={startDate}
                minimumDate={today}
                onChange={handleStartChange}
              />
            </View>
            <View style={styles.dateField}>
              <DateField
                label="Окончание"
                value={endDate}
                minimumDate={startDate}
                onChange={(date) => setEndDate(startOfDay(date))}
              />
            </View>
          </View>
          {days ? (
            <Text style={styles.hint}>
              Срок аренды: {pluralizeRu(days, ['день', 'дня', 'дней'])}
            </Text>
          ) : null}
        </Card>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button
          title="Разместить заявку"
          size="large"
          onPress={handleSubmit}
          loading={submitting}
        />
        <Text style={styles.footer}>
          Поставщики увидят заявку и предложат технику с ценой. Вы выбираете лучшее предложение.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: spacing.lg, paddingBottom: spacing.xl * 2, gap: spacing.lg },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  textarea: { minHeight: 110, paddingTop: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  dateRow: { flexDirection: 'row', gap: spacing.md },
  dateField: { flex: 1 },
  hint: { fontSize: 14, color: colors.textMuted },
  error: { color: colors.danger, fontSize: 14 },
  footer: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 18 },
});
