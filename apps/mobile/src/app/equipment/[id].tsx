import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Badge, Button, Card, ErrorBanner, Input, Loader } from '@/components/ui';
import { ApiError, createBooking, fetchEquipmentById, type Equipment } from '@/lib/api';
import {
  EQUIPMENT_STATUS_LABELS,
  SPEC_LABELS,
  formatMoney,
  formatSpecValue,
  parseDateInput,
  toIsoDate,
} from '@/lib/format';
import { colors, spacing } from '@/lib/theme';

function defaultDates() {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  const end = new Date(start);
  end.setDate(end.getDate() + 3);
  return { start: toIsoDate(start), end: toIsoDate(end) };
}

export default function EquipmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<Equipment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const initial = useMemo(defaultDates, []);
  const [startDate, setStartDate] = useState(initial.start);
  const [endDate, setEndDate] = useState(initial.end);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchEquipmentById(id);
      setItem(data.equipment);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось загрузить технику');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const parsedStart = parseDateInput(startDate);
  const parsedEnd = parseDateInput(endDate);
  const days =
    parsedStart && parsedEnd && parsedEnd > parsedStart
      ? Math.max(1, Math.ceil((parsedEnd.getTime() - parsedStart.getTime()) / 86_400_000))
      : null;
  const estimate = item && days ? Number(item.dailyRate) * days : null;

  const handleBook = async () => {
    setFormError(null);
    if (!item) return;
    if (!parsedStart || !parsedEnd) {
      setFormError('Введите даты в формате ГГГГ-ММ-ДД');
      return;
    }
    if (parsedEnd <= parsedStart) {
      setFormError('Дата окончания должна быть позже даты начала');
      return;
    }
    setSubmitting(true);
    try {
      await createBooking({
        equipmentId: item.id,
        startDate: toIsoDate(parsedStart),
        endDate: toIsoDate(parsedEnd),
      });
      Alert.alert('Заявка отправлена', 'Бронирование создано и ожидает подтверждения.', [
        { text: 'К бронированиям', onPress: () => router.replace('/(tabs)/bookings') },
        { text: 'Ок' },
      ]);
    } catch (caught) {
      setFormError(caught instanceof ApiError ? caught.message : 'Не удалось создать бронирование');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Loader />;

  if (error || !item) {
    return (
      <View style={styles.padded}>
        <ErrorBanner message={error ?? 'Техника не найдена'} onRetry={() => void load()} />
      </View>
    );
  }

  const specs = Object.entries(item.specs ?? {});
  const isAvailable = item.status === 'AVAILABLE';

  return (
    <>
      <Stack.Screen options={{ title: item.name }} />
      <ScrollView contentContainerStyle={styles.container}>
        {item.imageUrls.length > 0 ? (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={styles.gallery}
          >
            {item.imageUrls.map((url) => (
              <Image key={url} source={{ uri: url }} style={styles.image} resizeMode="cover" />
            ))}
          </ScrollView>
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Text style={styles.imagePlaceholderText}>Фото отсутствует</Text>
          </View>
        )}

        <View style={styles.header}>
          <Text style={styles.title}>{item.name}</Text>
          <Text style={styles.meta}>
            {item.category.name} · Поставщик: {item.company.name}
            {item.location?.city ? ` · ${item.location.city}` : ''}
          </Text>
          <Badge
            text={EQUIPMENT_STATUS_LABELS[item.status] ?? item.status}
            tone={isAvailable ? 'success' : 'neutral'}
          />
        </View>

        <Card style={styles.priceCard}>
          <PriceRow label="За день" value={formatMoney(item.dailyRate, item.currency)} primary />
          {item.weeklyRate ? (
            <PriceRow label="За неделю" value={formatMoney(item.weeklyRate, item.currency)} />
          ) : null}
          {item.monthlyRate ? (
            <PriceRow label="За месяц" value={formatMoney(item.monthlyRate, item.currency)} />
          ) : null}
        </Card>

        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Описание</Text>
          <Text style={styles.description}>{item.description ?? 'Описание не указано.'}</Text>
          {(item.make || item.model || item.year) && (
            <Text style={styles.meta}>
              {[item.make, item.model, item.year].filter(Boolean).join(' · ')}
            </Text>
          )}
        </Card>

        {specs.length > 0 ? (
          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>Характеристики</Text>
            {specs.map(([key, value]) => (
              <View key={key} style={styles.specRow}>
                <Text style={styles.specLabel}>{SPEC_LABELS[key] ?? key}</Text>
                <Text style={styles.specValue}>{formatSpecValue(value)}</Text>
              </View>
            ))}
          </Card>
        ) : null}

        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Забронировать</Text>
          <View style={styles.dateRow}>
            <View style={styles.dateField}>
              <Input
                label="Начало"
                value={startDate}
                onChangeText={setStartDate}
                placeholder="ГГГГ-ММ-ДД"
                keyboardType="numbers-and-punctuation"
                autoCorrect={false}
              />
            </View>
            <View style={styles.dateField}>
              <Input
                label="Окончание"
                value={endDate}
                onChangeText={setEndDate}
                placeholder="ГГГГ-ММ-ДД"
                keyboardType="numbers-and-punctuation"
                autoCorrect={false}
              />
            </View>
          </View>
          {days && estimate !== null ? (
            <Text style={styles.estimate}>
              {days} {days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'} ·{' '}
              <Text style={styles.estimateValue}>{formatMoney(estimate, item.currency)}</Text>
            </Text>
          ) : null}
          {formError ? <Text style={styles.formError}>{formError}</Text> : null}
          <Button
            title={isAvailable ? 'Забронировать' : 'Техника недоступна'}
            onPress={handleBook}
            disabled={!isAvailable}
            loading={submitting}
          />
        </Card>
      </ScrollView>
    </>
  );
}

function PriceRow({ label, value, primary }: { label: string; value: string; primary?: boolean }) {
  return (
    <View style={styles.priceRow}>
      <Text style={styles.priceLabel}>{label}</Text>
      <Text style={[styles.priceValue, primary && styles.priceValuePrimary]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  padded: { padding: spacing.lg },
  container: { paddingBottom: spacing.xl * 2, gap: spacing.lg },
  gallery: { height: 240 },
  image: { width: 400, maxWidth: '100%', height: 240, backgroundColor: colors.border },
  imagePlaceholder: { width: '100%', alignItems: 'center', justifyContent: 'center' },
  imagePlaceholderText: { color: colors.textSoft },
  header: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  meta: { fontSize: 14, color: colors.textMuted },
  priceCard: { marginHorizontal: spacing.lg, gap: spacing.sm },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between' },
  priceLabel: { fontSize: 14, color: colors.textMuted },
  priceValue: { fontSize: 15, fontWeight: '600', color: colors.text },
  priceValuePrimary: { fontSize: 18, fontWeight: '700', color: colors.primaryDark },
  section: { marginHorizontal: spacing.lg, gap: spacing.sm },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  description: { fontSize: 14, lineHeight: 20, color: colors.textMuted },
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  specLabel: { fontSize: 14, color: colors.textMuted, flexShrink: 1 },
  specValue: { fontSize: 14, fontWeight: '500', color: colors.text, textAlign: 'right' },
  dateRow: { flexDirection: 'row', gap: spacing.md },
  dateField: { flex: 1 },
  estimate: { fontSize: 14, color: colors.textMuted },
  estimateValue: { fontWeight: '700', color: colors.primaryDark },
  formError: { color: colors.danger, fontSize: 14 },
});
