import { Link, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Loader,
  type BadgeTone,
} from '@/components/ui';
import {
  ApiError,
  fetchMyEquipment,
  fetchProviderBookings,
  updateBookingStatus,
  type BookingStatus,
  type Equipment,
  type ProviderBooking,
} from '@/lib/api';
import {
  BOOKING_STATUS_LABELS,
  EQUIPMENT_STATUS_LABELS,
  formatDate,
  formatMoney,
  formatRate,
} from '@/lib/format';
import { colors, radius, spacing } from '@/lib/theme';

type Section = 'equipment' | 'bookings';

const SECTIONS: { key: Section; label: string }[] = [
  { key: 'equipment', label: 'Моя техника' },
  { key: 'bookings', label: 'Бронирования' },
];

const STATUS_TONES: Record<BookingStatus, BadgeTone> = {
  PENDING: 'warning',
  CONFIRMED: 'info',
  ACTIVE: 'success',
  COMPLETED: 'neutral',
  CANCELLED: 'danger',
};

/** Переходы статусов, доступные поставщику (как в BookingActionButtons на сайте). */
const PROVIDER_ALLOWED_TRANSITIONS: Partial<Record<BookingStatus, BookingStatus[]>> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['COMPLETED'],
};

const NEXT_STATUS_LABEL: Record<BookingStatus, string> = {
  PENDING: 'Ожидать',
  CONFIRMED: 'Подтвердить',
  ACTIVE: 'Начать аренду',
  COMPLETED: 'Завершить',
  CANCELLED: 'Отменить',
};

function Segmented({ value, onChange }: { value: Section; onChange: (next: Section) => void }) {
  return (
    <View style={styles.segmented}>
      {SECTIONS.map((section) => {
        const active = section.key === value;
        return (
          <Pressable
            key={section.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(section.key)}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
              {section.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function EquipmentRow({ item }: { item: Equipment }) {
  const image = item.imageUrls[0];
  return (
    <Link href={{ pathname: '/equipment/[id]', params: { id: item.id } }} asChild>
      <Pressable style={({ pressed }) => [styles.equipmentRow, pressed && styles.pressed]}>
        {image ? (
          <Image source={{ uri: image }} style={styles.thumb} resizeMode="cover" />
        ) : (
          <View style={[styles.thumb, styles.thumbPlaceholder]}>
            <Text style={styles.thumbText}>Нет фото</Text>
          </View>
        )}
        <View style={styles.equipmentBody}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {item.category.name}
          </Text>
          <View style={styles.row}>
            <Text style={styles.price}>
              {formatRate(item).price}
              <Text style={styles.priceUnit}>{formatRate(item).unit}</Text>
            </Text>
            <Badge
              text={EQUIPMENT_STATUS_LABELS[item.status] ?? item.status}
              tone={item.status === 'AVAILABLE' ? 'success' : 'neutral'}
            />
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

function BookingRow({
  booking,
  pendingStatus,
  onChangeStatus,
}: {
  booking: ProviderBooking;
  pendingStatus: BookingStatus | null;
  onChangeStatus: (booking: ProviderBooking, status: BookingStatus) => void;
}) {
  const transitions = PROVIDER_ALLOWED_TRANSITIONS[booking.status] ?? [];
  return (
    <Card style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {booking.equipment.name}
        </Text>
        <Badge text={BOOKING_STATUS_LABELS[booking.status]} tone={STATUS_TONES[booking.status]} />
      </View>
      <Text style={styles.meta}>Клиент: {booking.customer.name}</Text>
      <Text style={styles.meta}>
        {formatDate(booking.startDate)} – {formatDate(booking.endDate)}
      </Text>
      <View style={styles.row}>
        <Text style={styles.price}>{formatMoney(booking.totalPrice, booking.currency)}</Text>
        <Badge
          text={booking.depositPaid ? 'Оплачено' : 'Не оплачено'}
          tone={booking.depositPaid ? 'success' : 'neutral'}
        />
      </View>
      {booking.notes ? <Text style={styles.notes}>{booking.notes}</Text> : null}
      {transitions.length > 0 ? (
        <View style={styles.actions}>
          {transitions.map((status) => (
            <View key={status} style={styles.action}>
              <Button
                title={NEXT_STATUS_LABEL[status]}
                variant={status === 'CANCELLED' ? 'danger' : 'primary'}
                loading={pendingStatus === status}
                disabled={pendingStatus !== null}
                onPress={() => onChangeStatus(booking, status)}
              />
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

export default function ProviderScreen() {
  const [section, setSection] = useState<Section>('equipment');
  const [equipment, setEquipment] = useState<Equipment[] | null>(null);
  const [bookings, setBookings] = useState<ProviderBooking[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ id: string; status: BookingStatus } | null>(null);

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') setRefreshing(true);
    setError(null);
    try {
      const [equipmentData, bookingsData] = await Promise.all([
        fetchMyEquipment(),
        fetchProviderBookings(),
      ]);
      setEquipment(equipmentData.equipment);
      setBookings(bookingsData.bookings);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось загрузить данные');
      setEquipment((prev) => prev ?? []);
      setBookings((prev) => prev ?? []);
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Обновляем при каждом возврате на вкладку (после добавления техники и т.п.).
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const applyStatus = async (booking: ProviderBooking, status: BookingStatus) => {
    setPending({ id: booking.id, status });
    try {
      const { booking: updated } = await updateBookingStatus(booking.id, status);
      setBookings((prev) =>
        (prev ?? []).map((item) =>
          item.id === updated.id ? { ...item, status: updated.status } : item,
        ),
      );
    } catch (caught) {
      Alert.alert(
        'Ошибка',
        caught instanceof ApiError ? caught.message : 'Не удалось обновить статус',
      );
    } finally {
      setPending(null);
    }
  };

  const handleChangeStatus = (booking: ProviderBooking, status: BookingStatus) => {
    if (status !== 'CANCELLED') {
      void applyStatus(booking, status);
      return;
    }
    Alert.alert('Отменить бронирование?', `«${booking.equipment.name}» будет отменено.`, [
      { text: 'Нет', style: 'cancel' },
      { text: 'Отменить', style: 'destructive', onPress: () => void applyStatus(booking, status) },
    ]);
  };

  if (equipment === null || bookings === null) {
    return <Loader />;
  }

  const header = (
    <View style={styles.header}>
      <Segmented value={section} onChange={setSection} />
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {section === 'equipment' ? (
        <View style={styles.headerButtons}>
          <View style={styles.headerButton}>
            <Link href="/provider/equipment/new" asChild>
              <Button title="Добавить технику" />
            </Link>
          </View>
          <View style={styles.headerButton}>
            <Link href="/provider/orders" asChild>
              <Button title="Заявки клиентов" variant="secondary" />
            </Link>
          </View>
        </View>
      ) : null}
    </View>
  );

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={() => void load('refresh')}
      tintColor={colors.primary}
      colors={[colors.primary]}
    />
  );

  if (section === 'equipment') {
    return (
      <FlatList
        data={equipment}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <EquipmentRow item={item} />}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        refreshControl={refreshControl}
        ListHeaderComponent={header}
        ListEmptyComponent={
          !error ? (
            <EmptyState
              title="Техники пока нет"
              description="Нажмите «Добавить технику», чтобы разместить первое объявление."
            />
          ) : undefined
        }
      />
    );
  }

  return (
    <FlatList
      data={bookings}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <BookingRow
          booking={item}
          pendingStatus={pending?.id === item.id ? pending.status : null}
          onChangeStatus={handleChangeStatus}
        />
      )}
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
      refreshControl={refreshControl}
      ListHeaderComponent={header}
      ListEmptyComponent={
        !error ? (
          <EmptyState
            title="Бронирований пока нет"
            description="Здесь появятся заявки клиентов на вашу технику."
          />
        ) : undefined
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, paddingBottom: spacing.xl, flexGrow: 1 },
  header: { gap: spacing.md, marginBottom: spacing.md },
  headerButtons: { flexDirection: 'row', gap: spacing.sm },
  headerButton: { flex: 1 },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.border,
    borderRadius: radius.md,
    padding: 3,
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.sm + 2,
    alignItems: 'center',
  },
  segmentActive: { backgroundColor: colors.card },
  segmentText: { fontSize: 14, fontWeight: '500', color: colors.textMuted },
  segmentTextActive: { color: colors.text, fontWeight: '600' },
  equipmentRow: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  pressed: { opacity: 0.9 },
  thumb: { width: 84, height: 84, borderRadius: radius.md, backgroundColor: colors.border },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  thumbText: { color: colors.textSoft, fontSize: 12 },
  equipmentBody: { flex: 1, gap: spacing.xs },
  card: { gap: spacing.sm },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardTitle: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
  meta: { fontSize: 14, color: colors.textMuted },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  price: { fontSize: 16, fontWeight: '700', color: colors.primaryDark },
  priceUnit: { fontSize: 13, fontWeight: '400', color: colors.textMuted },
  notes: { fontSize: 13, color: colors.textMuted },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  action: { flexGrow: 1, flexBasis: '45%' },
});
