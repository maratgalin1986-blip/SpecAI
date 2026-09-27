import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Badge, Button, Card, ErrorBanner, Loader, type BadgeTone } from '@/components/ui';
import {
  ApiError,
  acceptBid,
  fetchOrderById,
  type Bid,
  type BidStatus,
  type Order,
  type OrderStatus,
} from '@/lib/api';
import {
  BID_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  formatDate,
  formatMoney,
  pluralizeRu,
} from '@/lib/format';
import { colors, spacing } from '@/lib/theme';

const ORDER_TONES: Record<OrderStatus, BadgeTone> = {
  OPEN: 'info',
  MATCHED: 'success',
  CANCELLED: 'neutral',
};

const BID_TONES: Record<BidStatus, BadgeTone> = {
  PENDING: 'warning',
  ACCEPTED: 'success',
  REJECTED: 'neutral',
};

function BidCard({
  bid,
  canAccept,
  accepting,
  onAccept,
}: {
  bid: Bid;
  canAccept: boolean;
  accepting: boolean;
  onAccept: (bid: Bid) => void;
}) {
  return (
    <Card style={styles.bidCard}>
      <View style={styles.bidHeader}>
        <View style={styles.bidTitleWrap}>
          <Text style={styles.bidTitle}>{bid.equipment?.name ?? 'Техника'}</Text>
          {bid.equipment?.company ? (
            <Text style={styles.bidCompany}>{bid.equipment.company.name}</Text>
          ) : null}
        </View>
        <Badge text={BID_STATUS_LABELS[bid.status]} tone={BID_TONES[bid.status]} />
      </View>
      <Text style={styles.bidPrice}>{formatMoney(bid.price, bid.currency)}</Text>
      {bid.message ? <Text style={styles.bidMessage}>{bid.message}</Text> : null}
      {canAccept && bid.status === 'PENDING' ? (
        <Button title="Принять предложение" loading={accepting} onPress={() => onAccept(bid)} />
      ) : null}
    </Card>
  );
}

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (!id) return;
      if (mode === 'refresh') setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const data = await fetchOrderById(id);
        setOrder(data.order);
        setIsOwner(data.isOwner);
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.message : 'Не удалось загрузить заявку');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [id],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const handleAccept = (bid: Bid) => {
    Alert.alert(
      'Принять предложение?',
      `${bid.equipment?.name ?? 'Техника'} за ${formatMoney(bid.price, bid.currency)}. Будет создано бронирование, остальные предложения отклонятся.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Принять',
          onPress: async () => {
            setAcceptingId(bid.id);
            try {
              await acceptBid(bid.id);
              await load('refresh');
              Alert.alert('Готово', 'Бронирование создано и ожидает подтверждения поставщика.', [
                { text: 'К бронированиям', onPress: () => router.replace('/(tabs)/bookings') },
                { text: 'Ок' },
              ]);
            } catch (caught) {
              Alert.alert(
                'Ошибка',
                caught instanceof ApiError ? caught.message : 'Не удалось принять предложение',
              );
            } finally {
              setAcceptingId(null);
            }
          },
        },
      ],
    );
  };

  if (loading) return <Loader />;

  if (error || !order) {
    return (
      <View style={styles.padded}>
        <ErrorBanner message={error ?? 'Заявка не найдена'} onRetry={() => void load()} />
      </View>
    );
  }

  const canAccept = isOwner && order.status === 'OPEN';

  return (
    <>
      <Stack.Screen options={{ title: 'Заявка' }} />
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load('refresh')}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <Card style={styles.section}>
          <View style={styles.headerRow}>
            <Text style={styles.meta}>
              {order.category?.name ?? 'Любая категория'} · {formatDate(order.desiredStartDate)} –{' '}
              {formatDate(order.desiredEndDate)}
            </Text>
            <Badge text={ORDER_STATUS_LABELS[order.status]} tone={ORDER_TONES[order.status]} />
          </View>
          <Text style={styles.description}>{order.description}</Text>
          <Text style={styles.created}>Создана {formatDate(order.createdAt)}</Text>
        </Card>

        <Text style={styles.sectionTitle}>
          {order.bids.length === 0
            ? 'Предложения'
            : pluralizeRu(order.bids.length, ['предложение', 'предложения', 'предложений'])}
        </Text>
        {order.bids.length === 0 ? (
          <Card>
            <Text style={styles.empty}>
              Пока никто не предложил технику. Поставщики получают уведомления о новых заявках —
              загляните позже.
            </Text>
          </Card>
        ) : (
          order.bids.map((bid) => (
            <BidCard
              key={bid.id}
              bid={bid}
              canAccept={canAccept}
              accepting={acceptingId === bid.id}
              onAccept={handleAccept}
            />
          ))
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  padded: { padding: spacing.lg },
  container: { padding: spacing.lg, paddingBottom: spacing.xl * 2, gap: spacing.md },
  section: { gap: spacing.sm },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  meta: { flex: 1, fontSize: 14, color: colors.textMuted },
  description: { fontSize: 16, lineHeight: 22, color: colors.text },
  created: { fontSize: 12, color: colors.textSoft },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginTop: spacing.sm },
  empty: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  bidCard: { gap: spacing.sm },
  bidHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  bidTitleWrap: { flex: 1, gap: 2 },
  bidTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  bidCompany: { fontSize: 13, color: colors.textMuted },
  bidPrice: { fontSize: 18, fontWeight: '700', color: colors.primaryDark },
  bidMessage: { fontSize: 14, lineHeight: 20, color: colors.textMuted },
});
