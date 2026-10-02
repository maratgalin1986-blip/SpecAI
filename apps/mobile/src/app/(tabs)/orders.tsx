import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Badge, EmptyState, ErrorBanner, Loader, Segmented, type BadgeTone } from '@/components/ui';
import { ApiError, fetchMyOrders, type Order, type OrderStatus } from '@/lib/api';
import { ORDER_STATUS_LABELS, formatDate, pluralizeRu } from '@/lib/format';
import { categoryIcon } from '@/lib/orderFlow';
import { colors, radius, shadow, spacing } from '@/theme';
import BookingsScreen from './bookings';

type OrdersView = 'orders' | 'bookings';

const VIEWS = [
  { value: 'orders', label: 'Заявки' },
  { value: 'bookings', label: 'Брони' },
] as const;

/**
 * Вкладка «Заказы» заказчика: заявки (как история поездок) и брони.
 * `?view=bookings` открывает брони сразу (ссылки «К бронированиям»).
 */
export default function OrdersTab() {
  const params = useLocalSearchParams<{ view?: string }>();
  const [view, setView] = useState<OrdersView>(params.view === 'bookings' ? 'bookings' : 'orders');

  useEffect(() => {
    if (params.view === 'bookings' || params.view === 'orders') setView(params.view);
  }, [params.view]);

  return (
    <View style={styles.flex}>
      <View style={styles.switcher}>
        <Segmented options={VIEWS} value={view} onChange={setView} />
      </View>
      {view === 'orders' ? <OrdersScreen /> : <BookingsScreen />}
    </View>
  );
}

const STATUS_TONES: Record<OrderStatus, BadgeTone> = {
  OPEN: 'info',
  MATCHED: 'success',
  CANCELLED: 'neutral',
};

function OrderCard({ order }: { order: Order }) {
  const pendingBids = order.bids.filter((bid) => bid.status === 'PENDING').length;
  return (
    <Link href={{ pathname: '/orders/[id]', params: { id: order.id } }} asChild>
      <Pressable style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardIcon}>{categoryIcon(order.category?.name)}</Text>
          <Text style={styles.cardTitle} numberOfLines={3}>
            {order.description}
          </Text>
          <Badge text={ORDER_STATUS_LABELS[order.status]} tone={STATUS_TONES[order.status]} />
        </View>
        <Text style={styles.meta}>
          {order.category?.name ?? 'Любая категория'} · {formatDate(order.desiredStartDate)} –{' '}
          {formatDate(order.desiredEndDate)}
        </Text>
        <Text style={[styles.bids, pendingBids > 0 && styles.bidsActive]}>
          {order.bids.length === 0
            ? 'Пока нет предложений'
            : pluralizeRu(order.bids.length, ['предложение', 'предложения', 'предложений'])}
          {pendingBids > 0 && order.status === 'OPEN' ? ` · ${pendingBids} ждут решения` : ''}
        </Text>
      </Pressable>
    </Link>
  );
}

function OrdersScreen() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') setRefreshing(true);
    setError(null);
    try {
      const data = await fetchMyOrders();
      setOrders(data.orders);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось загрузить заявки');
      setOrders((prev) => prev ?? []);
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Обновляем при каждом возврате на вкладку (после создания заявки или принятия предложения).
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (orders === null) {
    return <Loader />;
  }

  return (
    <View style={styles.flex}>
      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <OrderCard order={item} />}
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
              title="Заявок пока нет"
              description="Опишите, какая техника нужна и на какие даты — поставщики предложат варианты и цену."
            />
          ) : null
        }
      />
      <Link href="/orders/new" asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Новая заявка"
          style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        >
          <Ionicons name="add" size={22} color="#fff" />
          <Text style={styles.fabText}>Новая заявка</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  switcher: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  cardIcon: { fontSize: 22 },
  list: { padding: spacing.lg, paddingBottom: spacing.xl * 4, flexGrow: 1 },
  header: { marginBottom: spacing.md },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadow.card,
  },
  cardPressed: { opacity: 0.85 },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardTitle: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
  meta: { fontSize: 14, color: colors.textMuted },
  bids: { fontSize: 13, color: colors.textMuted },
  bidsActive: { color: colors.primaryDark, fontWeight: '600' },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 52,
    ...shadow.card,
  },
  fabPressed: { opacity: 0.85 },
  fabText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
