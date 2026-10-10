import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { FlatList, Linking, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { ShiftControls } from '@/components/ShiftControls';
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
  fetchMyAssignments,
  openShift,
  type BookingStatus,
  type OperatorBooking,
  type Shift,
} from '@/lib/api';
import { BOOKING_STATUS_LABELS, formatDate, phoneToHref } from '@/lib/format';
import { relativeDay } from '@/lib/orderFlow';
import { dayKey } from '@/lib/shifts';
import { colors, spacing } from '@/theme';

/** Смена в работе обновляется сама раз в полминуты. */
const POLL_MS = 30_000;

const STATUS_TONES: Record<BookingStatus, BadgeTone> = {
  PENDING: 'warning',
  CONFIRMED: 'info',
  ACTIVE: 'success',
  COMPLETED: 'neutral',
  CANCELLED: 'danger',
};

const STATUS_ORDER: Record<BookingStatus, number> = {
  ACTIVE: 0,
  CONFIRMED: 1,
  PENDING: 2,
  COMPLETED: 3,
  CANCELLED: 4,
};

function AssignmentCard({
  booking,
  onShiftChanged,
}: {
  booking: OperatorBooking;
  onShiftChanged: (bookingId: string, shift: Shift) => void;
}) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = dayKey(new Date());
  const active = booking.status === 'CONFIRMED' || booking.status === 'ACTIVE';
  const hasToday = booking.shifts.some((shift) => shift.date === today);
  const todayShift = booking.shifts.find((shift) => shift.date === today);
  const older = booking.shifts.filter((shift) => shift.date !== today);

  const start = async () => {
    setOpening(true);
    setError(null);
    try {
      const result = await openShift(booking.id);
      onShiftChanged(booking.id, result.shift);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось открыть смену');
    } finally {
      setOpening(false);
    }
  };

  return (
    <Card style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {booking.equipment.name}
        </Text>
        <Badge text={BOOKING_STATUS_LABELS[booking.status]} tone={STATUS_TONES[booking.status]} />
      </View>
      <Text style={styles.when}>
        {relativeDay(booking.startDate)} · {formatDate(booking.startDate)} –{' '}
        {formatDate(booking.endDate)}
      </Text>
      {booking.siteAddress ? (
        <View style={styles.place}>
          <Ionicons name="location-outline" size={16} color={colors.primary} />
          <Text style={styles.placeText}>{booking.siteAddress}</Text>
        </View>
      ) : (
        <Text style={styles.muted}>Адрес объекта уточните у диспетчера.</Text>
      )}
      {booking.notes ? <Text style={styles.muted}>{booking.notes}</Text> : null}
      {booking.contactPhone ? (
        <Button
          title="Позвонить контакту на объекте"
          variant="dark"
          onPress={() => void Linking.openURL(phoneToHref(booking.contactPhone!))}
        />
      ) : null}
      {todayShift ? (
        <ShiftControls
          shift={todayShift}
          role="operator"
          onChanged={(shift) => onShiftChanged(booking.id, shift)}
        />
      ) : active && !hasToday ? (
        <Button
          title="Начать смену сегодня"
          size="large"
          loading={opening}
          onPress={() => void start()}
        />
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {older.map((shift) => (
        <ShiftControls
          key={shift.id}
          shift={shift}
          role="operator"
          onChanged={(next) => onShiftChanged(booking.id, next)}
        />
      ))}
    </Card>
  );
}

/**
 * «Мои смены» машиниста: только назначенные ему брони — машина, даты, адрес
 * объекта, телефон контакта (у подтверждённой/активной брони), статусы
 * смены с фото и табель. Без цен и чужих заказов.
 */
export default function ShiftsScreen() {
  const [bookings, setBookings] = useState<OperatorBooking[] | null>(null);
  const [operator, setOperator] = useState<{ name: string; active: boolean } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (mode: 'initial' | 'refresh' | 'silent' = 'initial') => {
    if (mode === 'refresh') setRefreshing(true);
    if (mode !== 'silent') setError(null);
    try {
      const data = await fetchMyAssignments();
      setOperator(data.operator);
      setBookings(
        [...data.bookings].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]),
      );
    } catch (caught) {
      if (mode !== 'silent') {
        setError(caught instanceof ApiError ? caught.message : 'Не удалось загрузить смены');
      }
      setBookings((prev) => prev ?? []);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      const timer = setInterval(() => void load('silent'), POLL_MS);
      return () => clearInterval(timer);
    }, [load]),
  );

  const onShiftChanged = (bookingId: string, shift: Shift) =>
    setBookings((prev) =>
      (prev ?? []).map((booking) =>
        booking.id === bookingId
          ? {
              ...booking,
              shifts: booking.shifts.some((row) => row.id === shift.id)
                ? booking.shifts.map((row) => (row.id === shift.id ? shift : row))
                : [shift, ...booking.shifts],
            }
          : booking,
      ),
    );

  if (bookings === null) return <Loader />;

  return (
    <FlatList
      data={bookings}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <AssignmentCard booking={item} onShiftChanged={onShiftChanged} />}
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void load('refresh')}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          {operator ? (
            <Text style={styles.hello}>
              {operator.name}
              {operator.active ? '' : ' · доступ отключён'}
            </Text>
          ) : null}
          {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
        </View>
      }
      ListEmptyComponent={
        !error ? (
          <EmptyState
            title="Назначенных смен нет"
            description="Когда диспетчер назначит вас на заказ, он появится здесь с адресом объекта и кнопками смены."
          />
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
  header: { gap: spacing.md, marginBottom: spacing.md },
  hello: { fontSize: 14, color: colors.textMuted },
  card: { gap: spacing.sm },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: colors.text },
  when: { fontSize: 14, fontWeight: '700', color: colors.primaryDark },
  place: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  placeText: { flex: 1, fontSize: 14, color: colors.text },
  muted: { fontSize: 13, color: colors.textMuted },
  error: { fontSize: 13, color: colors.danger },
});
