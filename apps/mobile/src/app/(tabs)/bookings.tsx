import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
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
  cancelBooking,
  fetchMyBookings,
  type Booking,
  type BookingStatus,
} from '@/lib/api';
import { BOOKING_STATUS_LABELS, formatDate, formatMoney } from '@/lib/format';
import { colors, spacing } from '@/lib/theme';

const STATUS_TONES: Record<BookingStatus, BadgeTone> = {
  PENDING: 'warning',
  CONFIRMED: 'info',
  ACTIVE: 'success',
  COMPLETED: 'neutral',
  CANCELLED: 'danger',
};

function BookingCard({
  booking,
  onCancel,
  cancelling,
}: {
  booking: Booking;
  onCancel: (booking: Booking) => void;
  cancelling: boolean;
}) {
  const canCancel = booking.status === 'PENDING' || booking.status === 'CONFIRMED';
  return (
    <Card style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {booking.equipment.name}
        </Text>
        <Badge text={BOOKING_STATUS_LABELS[booking.status]} tone={STATUS_TONES[booking.status]} />
      </View>
      <Text style={styles.dates}>
        {formatDate(booking.startDate)} – {formatDate(booking.endDate)}
      </Text>
      <View style={styles.row}>
        <Text style={styles.price}>{formatMoney(booking.totalPrice, booking.currency)}</Text>
        {booking.depositPaid ? <Badge text="Оплачено" tone="success" /> : null}
      </View>
      {booking.notes ? <Text style={styles.notes}>{booking.notes}</Text> : null}
      {canCancel ? (
        <Button
          title="Отменить бронирование"
          variant="danger"
          loading={cancelling}
          onPress={() => onCancel(booking)}
        />
      ) : null}
    </Card>
  );
}

export default function BookingsScreen() {
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') setRefreshing(true);
    setError(null);
    try {
      const data = await fetchMyBookings();
      setBookings(data.bookings);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось загрузить бронирования');
      setBookings((prev) => prev ?? []);
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Обновляем список каждый раз, когда вкладка становится активной
  // (например, после создания бронирования из карточки техники).
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const handleCancel = (booking: Booking) => {
    Alert.alert('Отменить бронирование?', `«${booking.equipment.name}» будет отменено.`, [
      { text: 'Нет', style: 'cancel' },
      {
        text: 'Отменить',
        style: 'destructive',
        onPress: async () => {
          setCancellingId(booking.id);
          try {
            const { booking: updated } = await cancelBooking(booking.id);
            setBookings((prev) =>
              (prev ?? []).map((item) =>
                item.id === updated.id ? { ...item, status: updated.status } : item,
              ),
            );
          } catch (caught) {
            Alert.alert(
              'Ошибка',
              caught instanceof ApiError ? caught.message : 'Не удалось отменить бронирование',
            );
          } finally {
            setCancellingId(null);
          }
        },
      },
    ]);
  };

  if (bookings === null) {
    return <Loader />;
  }

  return (
    <FlatList
      data={bookings}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <BookingCard booking={item} onCancel={handleCancel} cancelling={cancellingId === item.id} />
      )}
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
        error ? (
          <View style={styles.header}>
            <ErrorBanner message={error} onRetry={() => void load()} />
          </View>
        ) : null
      }
      ListEmptyComponent={
        !error ? (
          <EmptyState
            title="Бронирований пока нет"
            description="Выберите технику в каталоге и нажмите «Забронировать»."
          />
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, paddingBottom: spacing.xl, flexGrow: 1 },
  header: { marginBottom: spacing.md },
  card: { gap: spacing.sm },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardTitle: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
  dates: { fontSize: 14, color: colors.textMuted },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  price: { fontSize: 17, fontWeight: '700', color: colors.primaryDark },
  notes: { fontSize: 13, color: colors.textMuted },
});
