import { Link, useFocusEffect, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Linking, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { ShiftStatusView } from '@/components/ShiftStatusView';
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
  createCheckout,
  fetchMyBookings,
  type Booking,
  type BookingStatus,
} from '@/lib/api';
import {
  BOOKING_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  REFUND_REQUIRED_LABEL,
  formatDate,
  formatMoney,
} from '@/lib/format';
import { colors, spacing } from '@/lib/theme';

const STATUS_TONES: Record<BookingStatus, BadgeTone> = {
  PENDING: 'warning',
  CONFIRMED: 'info',
  ACTIVE: 'success',
  COMPLETED: 'neutral',
  CANCELLED: 'danger',
};

function isPaid(booking: Booking): boolean {
  return booking.depositPaid || booking.payment?.status === 'PAID';
}

function BookingCard({
  booking,
  onCancel,
  onPay,
  onReview,
  cancelling,
  paying,
  paymentsEnabled,
}: {
  booking: Booking;
  onCancel: (booking: Booking) => void;
  onPay: (booking: Booking) => void;
  onReview: (booking: Booking) => void;
  cancelling: boolean;
  paying: boolean;
  paymentsEnabled: boolean;
}) {
  const paid = isPaid(booking);
  const canCancel = booking.status === 'PENDING' || booking.status === 'CONFIRMED';
  const refundRequired = booking.payment?.refundRequired === true;
  const canPay =
    paymentsEnabled &&
    (booking.status === 'PENDING' || booking.status === 'CONFIRMED') &&
    !paid &&
    !refundRequired;
  const canReview = booking.status === 'COMPLETED' && !booking.review;
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
      {booking.provider ? (
        <Text style={styles.notes}>
          Исполнитель: {booking.provider.name}
          {booking.provider.phone ? (
            <Text
              style={styles.phone}
              onPress={() =>
                void Linking.openURL(`tel:${booking.provider?.phone?.replace(/[^\d+]/g, '')}`)
              }
            >
              {' · '}
              {booking.provider.phone}
            </Text>
          ) : booking.status === 'PENDING' ? (
            ' · телефон появится после подтверждения'
          ) : null}
        </Text>
      ) : null}
      <View style={styles.row}>
        <Text style={styles.price}>{formatMoney(booking.totalPrice, booking.currency)}</Text>
        {refundRequired ? (
          <Badge text={REFUND_REQUIRED_LABEL} tone="danger" />
        ) : paid ? (
          <Badge text={PAYMENT_STATUS_LABELS.PAID} tone="success" />
        ) : booking.payment?.status === 'PENDING' ? (
          <Badge text={PAYMENT_STATUS_LABELS.PENDING} tone="warning" />
        ) : null}
      </View>
      {booking.notes ? <Text style={styles.notes}>{booking.notes}</Text> : null}
      {booking.review ? (
        <Text style={styles.reviewed}>Ваш отзыв: {'★'.repeat(booking.review.rating)}</Text>
      ) : null}
      <ShiftStatusView bookingId={booking.id} bookingStatus={booking.status} />
      {canPay ? <Button title="Оплатить" loading={paying} onPress={() => onPay(booking)} /> : null}
      {canReview ? (
        <Button title="Оставить отзыв" variant="secondary" onPress={() => onReview(booking)} />
      ) : null}
      {['CONFIRMED', 'ACTIVE', 'COMPLETED'].includes(booking.status) &&
      booking.equipment.companyId ? (
        <Link
          href={{
            pathname: '/comments',
            params: {
              companyId: booking.equipment.companyId,
              name: booking.provider?.name ?? booking.equipment.name,
            },
          }}
          asChild
        >
          <Button title="Комментарий об исполнителе" variant="secondary" />
        </Link>
      ) : null}
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
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  // Онлайн-оплата подключена на сервере; без неё кнопку «Оплатить» не показываем.
  const [paymentsEnabled, setPaymentsEnabled] = useState(false);

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') setRefreshing(true);
    setError(null);
    try {
      const data = await fetchMyBookings();
      setBookings(data.bookings);
      setPaymentsEnabled(data.paymentsEnabled === true);
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

  const handlePay = async (booking: Booking) => {
    setPayingId(booking.id);
    try {
      const { url } = await createCheckout(booking.id);
      // Stripe Checkout открывается во встроенном браузере; после закрытия
      // (успех, отмена или свайп назад) перечитываем список — статус оплаты
      // выставляет webhook Stripe, поэтому он может обновиться с задержкой.
      await WebBrowser.openBrowserAsync(url, { dismissButtonStyle: 'close' });
      await load('refresh');
    } catch (caught) {
      Alert.alert(
        'Ошибка',
        caught instanceof ApiError ? caught.message : 'Не удалось открыть страницу оплаты',
      );
    } finally {
      setPayingId(null);
    }
  };

  const handleReview = (booking: Booking) => {
    router.push({
      pathname: '/bookings/[id]/review',
      params: { id: booking.id, name: booking.equipment.name },
    });
  };

  if (bookings === null) {
    return <Loader />;
  }

  return (
    <FlatList
      data={bookings}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <BookingCard
          booking={item}
          onCancel={handleCancel}
          onPay={handlePay}
          onReview={handleReview}
          cancelling={cancellingId === item.id}
          paying={payingId === item.id}
          paymentsEnabled={paymentsEnabled}
        />
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
  phone: { color: colors.primaryDark, fontWeight: '600' },
  notes: { fontSize: 13, color: colors.textMuted },
  reviewed: { fontSize: 13, color: colors.primaryDark, fontWeight: '600' },
});
