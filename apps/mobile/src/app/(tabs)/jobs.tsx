import { Link, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ProviderBookingOps } from '@/components/ProviderBookingOps';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Loader,
  Segmented,
  type BadgeTone,
} from '@/components/ui';
import {
  ApiError,
  fetchOpenOrders,
  fetchOperators,
  fetchProviderBookings,
  updateBookingStatus,
  type BookingStatus,
  type Operator,
  type Order,
  type ProviderBooking,
} from '@/lib/api';
import {
  BOOKING_STATUS_LABELS,
  formatDate,
  formatMoney,
  phoneToHref,
  pluralizeRu,
} from '@/lib/format';
import { categoryIcon, relativeDay } from '@/lib/orderFlow';
import { colors, spacing } from '@/theme';

type JobsView = 'bookings' | 'bids';

const VIEWS = [
  { value: 'bookings', label: 'Брони' },
  { value: 'bids', label: 'Мои предложения' },
] as const;

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
  ACTIVE: 'На объекте — начать',
  COMPLETED: 'Завершить смену',
  CANCELLED: 'Отказаться',
};

/** Сначала то, что требует действия: ждут подтверждения, затем в работе. */
const STATUS_ORDER: Record<BookingStatus, number> = {
  PENDING: 0,
  ACTIVE: 1,
  CONFIRMED: 2,
  COMPLETED: 3,
  CANCELLED: 4,
};

function BookingRow({
  booking,
  pendingStatus,
  operators,
  onChangeStatus,
  onOperatorChanged,
}: {
  booking: ProviderBooking;
  pendingStatus: BookingStatus | null;
  operators: Operator[];
  onChangeStatus: (booking: ProviderBooking, status: BookingStatus) => void;
  onOperatorChanged: (bookingId: string, operatorId: string | null) => void;
}) {
  const transitions = PROVIDER_ALLOWED_TRANSITIONS[booking.status] ?? [];
  const phone = booking.customer.phone;
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
      <Text style={styles.meta}>Заказчик: {booking.customer.name}</Text>
      <Text style={styles.price}>{formatMoney(booking.totalPrice, booking.currency)}</Text>
      {booking.notes ? <Text style={styles.notes}>{booking.notes}</Text> : null}
      {phone ? (
        <View style={styles.actions}>
          <View style={styles.action}>
            <Button
              title="Позвонить"
              variant="dark"
              accessibilityLabel={`Позвонить заказчику ${phone}`}
              onPress={() => void Linking.openURL(phoneToHref(phone))}
            />
          </View>
          {booking.customer.email ? (
            <View style={styles.action}>
              <Button
                title="E-mail"
                variant="secondary"
                onPress={() => void Linking.openURL(`mailto:${booking.customer.email}`)}
              />
            </View>
          ) : null}
        </View>
      ) : booking.customer.email ? (
        <Text
          style={styles.contact}
          onPress={() => void Linking.openURL(`mailto:${booking.customer.email}`)}
        >
          {booking.customer.email}
        </Text>
      ) : null}
      {booking.status === 'PENDING' ? (
        <Text style={styles.notes}>
          Телефон и e-mail заказчика появятся после того, как вы подтвердите бронь.
        </Text>
      ) : null}
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
      <ProviderBookingOps
        bookingId={booking.id}
        bookingStatus={booking.status}
        operatorId={booking.operatorId}
        operators={operators}
        onOperatorChanged={(operatorId) => onOperatorChanged(booking.id, operatorId)}
      />
      {booking.status !== 'CANCELLED' ? (
        <Link
          href={{
            pathname: '/comments',
            params: { userId: booking.customer.id, name: booking.customer.name },
          }}
          asChild
        >
          <Button title="Комментарий о заказчике" variant="ghost" />
        </Link>
      ) : null}
    </Card>
  );
}

function BidRow({ order }: { order: Order }) {
  const own = order.bids.find((bid) => bid.status === 'PENDING') ?? order.bids[0];
  const total = order.bidCount ?? order.bids.length;
  return (
    <Link href={{ pathname: '/orders/[id]', params: { id: order.id } }} asChild>
      <Pressable accessibilityRole="button" style={({ pressed }) => pressed && styles.pressed}>
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.icon}>{categoryIcon(order.category?.name)}</Text>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {order.category?.name ?? 'Заявка'} · {relativeDay(order.desiredStartDate)}
            </Text>
            <Badge text="Ждёт выбора" tone="warning" />
          </View>
          <Text style={styles.meta} numberOfLines={2}>
            {order.description}
          </Text>
          {own ? (
            <Text style={styles.price}>Ваша цена: {formatMoney(own.price, own.currency)}</Text>
          ) : null}
          <Text style={styles.notes}>
            {total > 1
              ? `Всего ${pluralizeRu(total, ['предложение', 'предложения', 'предложений'])} — заказчик сравнивает`
              : 'Пока вы единственный — заказчик скоро ответит'}
          </Text>
        </Card>
      </Pressable>
    </Link>
  );
}

/** «Мои заказы» исполнителя: брони техники компании и отправленные предложения. */
export default function JobsScreen() {
  const [view, setView] = useState<JobsView>('bookings');
  const [bookings, setBookings] = useState<ProviderBooking[] | null>(null);
  const [bids, setBids] = useState<Order[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ id: string; status: BookingStatus } | null>(null);

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') setRefreshing(true);
    setError(null);
    try {
      const [bookingsResult, ordersResult, operatorsResult] = await Promise.allSettled([
        fetchProviderBookings(),
        fetchOpenOrders(),
        fetchOperators(),
      ]);
      if (operatorsResult.status === 'fulfilled') setOperators(operatorsResult.value.operators);
      if (bookingsResult.status === 'fulfilled') {
        setBookings(
          [...bookingsResult.value.bookings].sort(
            (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status],
          ),
        );
      }
      if (ordersResult.status === 'fulfilled') {
        // В открытой ленте bids — только предложения своей компании.
        setBids(
          ordersResult.value.orders.filter(
            (order) =>
              order.status === 'OPEN' && order.bids.some((bid) => bid.status === 'PENDING'),
          ),
        );
      }
      const failed = [bookingsResult, ordersResult].find((r) => r.status === 'rejected');
      if (failed) throw failed.reason;
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось загрузить заказы');
      setBookings((prev) => prev ?? []);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const applyStatus = async (booking: ProviderBooking, status: BookingStatus) => {
    setPending({ id: booking.id, status });
    try {
      await updateBookingStatus(booking.id, status);
      // Перечитываем: после подтверждения сервер откроет контакты заказчика.
      await load('refresh');
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
    Alert.alert('Отказаться от брони?', `«${booking.equipment.name}» будет отменена.`, [
      { text: 'Нет', style: 'cancel' },
      {
        text: 'Отказаться',
        style: 'destructive',
        onPress: () => void applyStatus(booking, status),
      },
    ]);
  };

  if (bookings === null) return <Loader />;

  const header = (
    <View style={styles.header}>
      <Segmented options={VIEWS} value={view} onChange={setView} />
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
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

  if (view === 'bids') {
    return (
      <FlatList
        data={bids}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <BidRow order={item} />}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        refreshControl={refreshControl}
        ListHeaderComponent={header}
        ListEmptyComponent={
          !error ? (
            <EmptyState
              title="Нет ожидающих предложений"
              description="Предложите цену в «Ленте» — заказчик увидит её и сможет выбрать вас."
            />
          ) : null
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
          operators={operators}
          onChangeStatus={handleChangeStatus}
          onOperatorChanged={(bookingId, operatorId) =>
            setBookings((prev) =>
              (prev ?? []).map((row) => (row.id === bookingId ? { ...row, operatorId } : row)),
            )
          }
        />
      )}
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
      refreshControl={refreshControl}
      ListHeaderComponent={header}
      ListEmptyComponent={
        !error ? (
          <EmptyState
            title="Броней пока нет"
            description="Когда заказчик выберет ваше предложение или забронирует технику, бронь появится здесь."
          />
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.85 },
  list: { padding: spacing.lg, paddingBottom: spacing.xl, flexGrow: 1 },
  header: { gap: spacing.md, marginBottom: spacing.md },
  card: { gap: spacing.sm },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  icon: { fontSize: 22 },
  cardTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text },
  when: { fontSize: 14, fontWeight: '700', color: colors.primaryDark },
  meta: { fontSize: 14, color: colors.textMuted },
  contact: { fontSize: 14, color: colors.primaryDark, fontWeight: '600' },
  price: { fontSize: 17, fontWeight: '800', color: colors.text },
  notes: { fontSize: 13, color: colors.textMuted },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  action: { flexGrow: 1, flexBasis: '45%' },
});
