import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CommentsSection } from '@/components/CommentsSection';
import { ContactActions } from '@/components/ContactActions';
import { DateField } from '@/components/DateField';
import { Badge, Button, Card, ErrorBanner, Loader } from '@/components/ui';
import { ApiError, createBooking, fetchEquipmentById, type Equipment } from '@/lib/api';
import {
  EQUIPMENT_STATUS_LABELS,
  SPEC_LABELS,
  addDays,
  bookingDays,
  formatMoney,
  formatRate,
  formatSpecValue,
  pluralizeRu,
  startOfDay,
  toIsoDate,
} from '@/lib/format';
import { colors, radius, spacing } from '@/lib/theme';

export default function EquipmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<Equipment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const today = useMemo(() => startOfDay(new Date()), []);
  const [startDate, setStartDate] = useState(() => addDays(today, 1));
  const [endDate, setEndDate] = useState(() => addDays(today, 4));
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

  // Обе даты включительно, как на сервере: бронь на один день — начало и конец в один день.
  const days = bookingDays(startDate, endDate);
  const estimate = item && days ? Number(item.dailyRate) * days : null;

  const handleStartChange = (date: Date) => {
    const next = startOfDay(date);
    setStartDate(next);
    // Окончание не раньше начала — сдвигаем, если пользователь выбрал более позднее начало.
    if (endDate < next) setEndDate(next);
  };

  const handleBook = async () => {
    setFormError(null);
    if (!item) return;
    if (!days) {
      setFormError('Дата окончания не может быть раньше даты начала');
      return;
    }
    setSubmitting(true);
    try {
      await createBooking({
        equipmentId: item.id,
        startDate: toIsoDate(startDate),
        endDate: toIsoDate(endDate),
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
  const rate = formatRate(item);
  const hasHourly = rate.note !== null;

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
          <View style={styles.headlinePrice}>
            <Text style={styles.headlinePriceValue}>
              {rate.price}
              <Text style={styles.headlinePriceUnit}>{rate.unit}</Text>
            </Text>
            <Text style={styles.headlinePriceLabel}>
              {hasHourly ? 'за машино-час' : 'за сутки аренды'}
            </Text>
          </View>
          {hasHourly ? (
            <PriceRow label="Смена 8 ч" value={formatMoney(item.dailyRate, item.currency)} />
          ) : null}
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
          {days && estimate !== null ? (
            <View style={styles.estimateBox}>
              <View style={styles.estimateRow}>
                <Text style={styles.estimateLabel}>
                  {pluralizeRu(days, ['день', 'дня', 'дней'])} ×{' '}
                  {formatMoney(item.dailyRate, item.currency)}
                  {hasHourly ? ' (смена 8 ч)' : ''}
                </Text>
                <Text style={styles.estimateValue}>{formatMoney(estimate, item.currency)}</Text>
              </View>
              <Text style={styles.estimateHint}>
                {hasHourly
                  ? 'Предварительно: дни × стоимость смены 8 ч. Точную сумму по машино-часам уточнит менеджер. Бронирование бесплатное, без предоплаты.'
                  : 'Итоговая стоимость рассчитывается по суточной ставке. Бронирование бесплатное, без предоплаты.'}
              </Text>
            </View>
          ) : null}
          {formError ? <Text style={styles.formError}>{formError}</Text> : null}
          <Button
            title={isAvailable ? 'Забронировать' : 'Техника недоступна'}
            onPress={handleBook}
            disabled={!isAvailable}
            loading={submitting}
          />
        </Card>

        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Заказать по телефону</Text>
          <Text style={styles.description}>Оставьте номер — уточним даты, доставку и цену.</Text>
          <ContactActions
            source={`mobile:equipment:${item.id}`}
            message={`Интересует: ${item.name}`}
          />
        </Card>

        <View style={styles.comments}>
          <CommentsSection
            target={{ companyId: item.company.id }}
            title={`Комментарии об исполнителе «${item.company.name}»`}
            formLabel="Комментарий об исполнителе"
          />
        </View>
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
  comments: { marginHorizontal: spacing.lg },
  container: { paddingBottom: spacing.xl * 2, gap: spacing.lg },
  gallery: { height: 240 },
  image: { width: 400, maxWidth: '100%', height: 240, backgroundColor: colors.border },
  imagePlaceholder: { width: '100%', alignItems: 'center', justifyContent: 'center' },
  imagePlaceholderText: { color: colors.textSoft },
  header: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  meta: { fontSize: 14, color: colors.textMuted },
  priceCard: { marginHorizontal: spacing.lg, gap: spacing.sm },
  headlinePrice: { gap: 2 },
  headlinePriceValue: { fontSize: 24, fontWeight: '700', color: colors.primaryDark },
  headlinePriceUnit: { fontSize: 15, fontWeight: '400', color: colors.textMuted },
  headlinePriceLabel: { fontSize: 13, color: colors.textMuted },
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
  estimateBox: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  estimateRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  estimateLabel: { fontSize: 14, color: colors.text },
  estimateValue: { fontSize: 16, fontWeight: '700', color: colors.primaryDark },
  estimateHint: { fontSize: 12, color: colors.textMuted },
  formError: { color: colors.danger, fontSize: 14 },
});
