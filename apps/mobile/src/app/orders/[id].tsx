import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BidCountdown } from '@/components/BidCountdown';
import { OfferBreakdown } from '@/components/OfferBreakdown';
import { OrderContact } from '@/components/OrderContact';
import {
  Badge,
  Button,
  Card,
  ErrorBanner,
  Loader,
  SectionTitle,
  type BadgeTone,
} from '@/components/ui';
import {
  ApiError,
  acceptBid,
  cancelBooking,
  cancelOrder,
  fetchMyBookings,
  fetchOrderById,
  type Bid,
  type BidStatus,
  type Booking,
  type Order,
} from '@/lib/api';
import {
  BID_STATUS_LABELS,
  BOOKING_STATUS_LABELS,
  formatDate,
  formatMoney,
  phoneToHref,
  pluralizeRu,
} from '@/lib/format';
import {
  ORDER_STAGES,
  addressFromDescription,
  categoryIcon,
  orderDays,
  orderStage,
  relativeDay,
  stageHeadline,
} from '@/lib/orderFlow';
import { colors, radius, spacing, TAP, typography } from '@/theme';

const BID_TONES: Record<BidStatus, BadgeTone> = {
  PENDING: 'warning',
  ACCEPTED: 'success',
  REJECTED: 'neutral',
};

/** Пока идёт поиск исполнителя, заявка обновляется сама. */
const POLL_MS = 30_000;

function Timeline({ index, cancelled }: { index: number; cancelled: boolean }) {
  return (
    <View style={styles.timeline} accessibilityLabel={`Этап: ${ORDER_STAGES[index]?.label ?? ''}`}>
      {ORDER_STAGES.map((stage, i) => {
        const done = i < index || (i === index && index === ORDER_STAGES.length - 1);
        const current = i === index && !done;
        const last = i === ORDER_STAGES.length - 1;
        return (
          <View key={stage.key} style={styles.step}>
            <View style={styles.stepRail}>
              <View
                style={[
                  styles.dot,
                  done && styles.dotDone,
                  current && (cancelled ? styles.dotCancelled : styles.dotCurrent),
                ]}
              >
                {done ? <Ionicons name="checkmark" size={14} color={colors.onPrimary} /> : null}
                {current && cancelled ? (
                  <Ionicons name="close" size={14} color={colors.onPrimary} />
                ) : null}
              </View>
              {!last ? <View style={[styles.rail, i < index && styles.railDone]} /> : null}
            </View>
            <Text
              style={[
                styles.stepLabel,
                (done || current) && styles.stepLabelActive,
                current && cancelled && styles.stepLabelCancelled,
              ]}
            >
              {current && cancelled ? `${stage.label} · отменён` : stage.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function OfferCard({
  bid,
  best,
  canAccept,
  accepting,
  onAccept,
}: {
  bid: Bid;
  best: boolean;
  canAccept: boolean;
  accepting: boolean;
  onAccept: (bid: Bid) => void;
}) {
  const company = bid.equipment?.company;
  const initial = (company?.name ?? '?').trim().charAt(0).toUpperCase();
  return (
    <Card style={styles.offer}>
      <View style={styles.offerHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <View style={styles.flex}>
          <Text style={styles.offerCompany} numberOfLines={1}>
            {company?.name ?? 'Исполнитель'}
          </Text>
          <View style={styles.offerBadges}>
            {company?.verified ? <Badge text="Проверен" tone="success" /> : null}
            {typeof company?.rating === 'number' ? (
              <Text style={styles.rating}>★ {company.rating.toFixed(1)}</Text>
            ) : null}
            {best ? <Badge text="Лучшая цена" tone="accent" /> : null}
            {bid.status !== 'PENDING' ? (
              <Badge text={BID_STATUS_LABELS[bid.status]} tone={BID_TONES[bid.status]} />
            ) : null}
          </View>
        </View>
        <Text style={styles.offerPrice}>{formatMoney(bid.price, bid.currency)}</Text>
      </View>
      <Text style={styles.offerMachine} numberOfLines={2}>
        {bid.equipment?.name ?? 'Техника'}
      </Text>
      <OfferBreakdown bid={bid} />
      {bid.message ? <Text style={styles.offerMessage}>{bid.message}</Text> : null}
      {canAccept && bid.status === 'PENDING' ? (
        <Button
          title={`Выбрать за ${formatMoney(bid.price, bid.currency)}`}
          loading={accepting}
          onPress={() => onAccept(bid)}
        />
      ) : null}
    </Card>
  );
}

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' | 'silent' = 'initial') => {
      if (!id) return;
      if (mode === 'refresh') setRefreshing(true);
      if (mode === 'initial') setLoading(true);
      if (mode !== 'silent') setError(null);
      try {
        const data = await fetchOrderById(id);
        setOrder(data.order);
        setIsOwner(data.isOwner);
        if (data.isOwner && data.order.status === 'MATCHED') {
          // Бронь по заявке — из списка броней заказчика (поле orderId).
          const { bookings } = await fetchMyBookings().catch(() => ({ bookings: [] as Booking[] }));
          setBooking(bookings.find((item) => item.orderId === data.order.id) ?? null);
        }
      } catch (caught) {
        if (mode !== 'silent') {
          setError(caught instanceof ApiError ? caught.message : 'Не удалось загрузить заказ');
        }
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

  const searching = isOwner && order?.status === 'OPEN';
  useFocusEffect(
    useCallback(() => {
      if (!searching) return undefined;
      const timer = setInterval(() => void load('silent'), POLL_MS);
      return () => clearInterval(timer);
    }, [searching, load]),
  );

  const handleAccept = (bid: Bid) => {
    Alert.alert(
      'Выбрать исполнителя?',
      `${bid.equipment?.company.name ?? 'Исполнитель'}: ${bid.equipment?.name ?? 'техника'} за ${formatMoney(bid.price, bid.currency)}. Остальные предложения отклонятся.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Выбрать',
          onPress: async () => {
            setAcceptingId(bid.id);
            try {
              await acceptBid(bid.id);
              await load('refresh');
              Alert.alert(
                'Исполнитель выбран',
                'Он подтвердит заказ, и здесь появится его телефон.',
              );
            } catch (caught) {
              Alert.alert(
                'Ошибка',
                caught instanceof ApiError ? caught.message : 'Не удалось выбрать предложение',
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
        <ErrorBanner message={error ?? 'Заказ не найден'} onRetry={() => void load()} />
      </View>
    );
  }

  const bidCount = order.bidCount ?? order.bids.length;
  const stageInput = {
    orderStatus: order.status,
    bidCount,
    bookingStatus: booking?.status ?? null,
  };
  const stage = orderStage(stageInput);
  const canAccept = isOwner && order.status === 'OPEN';
  const address = order.location?.addressLine || addressFromDescription(order.description);
  const days = orderDays(order.desiredStartDate, order.desiredEndDate);
  const pendingPrices = order.bids
    .filter((bid) => bid.status === 'PENDING')
    .map((bid) => Number(bid.price));
  const bestPrice = pendingPrices.length > 1 ? Math.min(...pendingPrices) : null;
  const canCancelBooking =
    booking !== null && (booking.status === 'PENDING' || booking.status === 'CONFIRMED');
  const phone = booking?.provider?.phone ?? null;

  const confirmCancel = () => {
    const title = canCancelBooking ? 'Отменить заказ?' : 'Отменить заявку?';
    Alert.alert(title, 'Исполнители больше не смогут присылать предложения.', [
      { text: 'Нет', style: 'cancel' },
      {
        text: 'Отменить',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            if (canCancelBooking && booking) await cancelBooking(booking.id);
            else await cancelOrder(order.id);
            await load('refresh');
          } catch (caught) {
            Alert.alert(
              'Ошибка',
              caught instanceof ApiError ? caught.message : 'Не удалось отменить',
            );
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Заказ' }} />
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
        <View style={styles.hero} accessibilityRole="summary">
          <View style={styles.heroRow}>
            <Text style={styles.heroIcon}>{categoryIcon(order.category?.name)}</Text>
            <View style={styles.flex}>
              <Text style={styles.heroTitle}>{stageHeadline(stageInput)}</Text>
              <Text style={styles.heroMeta}>
                {order.category?.name ?? 'Спецтехника'} · {relativeDay(order.desiredStartDate)}
                {days > 1 ? ` · ${pluralizeRu(days, ['день', 'дня', 'дней'])}` : ' · 1 смена'}
              </Text>
            </View>
            {searching && bidCount === 0 ? <ActivityIndicator color={colors.primary} /> : null}
          </View>
          {address ? (
            <View style={styles.heroAddress}>
              <Ionicons name="location" size={16} color={colors.primary} />
              <Text style={styles.heroAddressText} numberOfLines={2}>
                {address}
              </Text>
            </View>
          ) : null}
          {searching ? (
            <Text style={styles.heroHint}>
              {bidCount === 0
                ? 'Заявку видят все исполнители сервиса. Обычно первые предложения приходят в течение часа — экран обновляется сам.'
                : 'Сравните цены и выберите исполнителя. Новые предложения появятся здесь.'}
            </Text>
          ) : null}
        </View>

        <Card>
          <Timeline index={stage.index} cancelled={stage.cancelled} />
        </Card>

        {!isOwner && order.status === 'OPEN' ? (
          <Card style={styles.section}>
            <BidCountdown bidsUntil={order.bidsUntil} />
            <OrderContact order={order} />
          </Card>
        ) : null}

        {isOwner && booking ? (
          <Card style={styles.section}>
            <SectionTitle>Исполнитель</SectionTitle>
            <Text style={styles.executorName}>{booking.provider?.name ?? 'Исполнитель'}</Text>
            <Text style={styles.meta}>
              {booking.equipment.name} · {formatDate(booking.startDate)} –{' '}
              {formatDate(booking.endDate)}
            </Text>
            <View style={styles.rowBetween}>
              <Text style={styles.price}>{formatMoney(booking.totalPrice, booking.currency)}</Text>
              <Badge text={BOOKING_STATUS_LABELS[booking.status]} tone="info" />
            </View>
            {phone ? (
              <View style={styles.contactRow}>
                <View style={styles.flex}>
                  <Button
                    title="Позвонить"
                    accessibilityLabel={`Позвонить исполнителю ${phone}`}
                    onPress={() => void Linking.openURL(phoneToHref(phone))}
                  />
                </View>
                <View style={styles.flex}>
                  <Button
                    title="SMS"
                    variant="secondary"
                    accessibilityLabel={`Написать SMS исполнителю ${phone}`}
                    onPress={() =>
                      void Linking.openURL(`sms:${phoneToHref(phone).replace('tel:', '')}`)
                    }
                  />
                </View>
              </View>
            ) : booking.status === 'PENDING' ? (
              <Text style={styles.hint}>
                Телефон исполнителя появится, когда он подтвердит заказ.
              </Text>
            ) : null}
            {booking.status === 'COMPLETED' && !booking.review ? (
              <Button
                title="Оценить исполнителя"
                variant="dark"
                onPress={() =>
                  router.push({
                    pathname: '/bookings/[id]/review',
                    params: { id: booking.id, name: booking.equipment.name },
                  })
                }
              />
            ) : null}
            {booking.equipment.companyId && booking.status !== 'PENDING' ? (
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
          </Card>
        ) : null}

        {isOwner && order.status === 'MATCHED' && !booking ? (
          <Card style={styles.section}>
            <Text style={styles.hint}>
              Исполнитель выбран. Подробности и контакты — во вкладке «Заказы» → «Брони».
            </Text>
            <Button
              title="Открыть брони"
              variant="secondary"
              onPress={() =>
                router.replace({ pathname: '/(tabs)/orders', params: { view: 'bookings' } })
              }
            />
          </Card>
        ) : null}

        {order.status === 'OPEN' || !isOwner ? (
          <>
            <SectionTitle>
              {isOwner
                ? `Предложения${bidCount > 0 ? ` · ${bidCount}` : ''}`
                : order.bids.length > 1
                  ? 'Ваши предложения'
                  : 'Ваше предложение'}
            </SectionTitle>
            {order.bids.length === 0 ? (
              <Card>
                <Text style={styles.hint}>
                  {isOwner
                    ? 'Пока никто не предложил технику. Мы покажем предложения, как только они придут.'
                    : 'Вы ещё не отправили предложение по этой заявке.'}
                </Text>
              </Card>
            ) : (
              order.bids.map((bid) => (
                <OfferCard
                  key={bid.id}
                  bid={bid}
                  best={bestPrice !== null && Number(bid.price) === bestPrice}
                  canAccept={canAccept}
                  accepting={acceptingId === bid.id}
                  onAccept={handleAccept}
                />
              ))
            )}
          </>
        ) : null}

        <Card style={styles.section}>
          <SectionTitle>Детали</SectionTitle>
          <Text style={styles.description}>{order.description}</Text>
          <Text style={styles.meta}>
            {formatDate(order.desiredStartDate)} – {formatDate(order.desiredEndDate)} · создан{' '}
            {formatDate(order.createdAt)}
          </Text>
        </Card>

        {isOwner && (order.status === 'OPEN' || canCancelBooking) ? (
          <Button
            title={order.status === 'OPEN' ? 'Отменить заявку' : 'Отменить заказ'}
            variant="danger"
            loading={busy}
            onPress={confirmCancel}
          />
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  padded: { padding: spacing.lg },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl * 2, gap: spacing.md },
  section: { gap: spacing.sm },
  hero: {
    backgroundColor: colors.dark,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroIcon: { fontSize: 32 },
  heroTitle: { ...typography.title, fontSize: 20, lineHeight: 26, color: colors.onDark },
  heroMeta: { fontSize: 14, color: colors.onDarkMuted, marginTop: 2 },
  heroAddress: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  heroAddressText: { flex: 1, color: colors.onDark, fontSize: 14 },
  heroHint: { color: colors.onDarkMuted, fontSize: 13, lineHeight: 18 },
  timeline: { gap: 0 },
  step: { flexDirection: 'row', gap: spacing.md, minHeight: 36 },
  stepRail: { alignItems: 'center', width: 22 },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  dotCurrent: { borderColor: colors.primary, borderWidth: 6 },
  dotCancelled: { backgroundColor: colors.danger, borderColor: colors.danger },
  rail: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 2 },
  railDone: { backgroundColor: colors.primary },
  stepLabel: { fontSize: 15, color: colors.textSoft, paddingTop: 1 },
  stepLabelActive: { color: colors.text, fontWeight: '600' },
  stepLabelCancelled: { color: colors.danger },
  offer: { gap: spacing.sm },
  offerHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: TAP,
    height: TAP,
    borderRadius: TAP / 2,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '800', color: colors.primaryDark },
  offerCompany: { fontSize: 16, fontWeight: '700', color: colors.text },
  offerBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 2,
  },
  rating: { fontSize: 13, fontWeight: '700', color: colors.text },
  offerPrice: { fontSize: 18, fontWeight: '800', color: colors.text },
  offerMachine: { fontSize: 14, color: colors.textMuted },
  offerMessage: { fontSize: 14, lineHeight: 20, color: colors.text },
  executorName: { fontSize: 18, fontWeight: '700', color: colors.text },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  price: { fontSize: 18, fontWeight: '800', color: colors.text },
  contactRow: { flexDirection: 'row', gap: spacing.sm },
  meta: { fontSize: 14, color: colors.textMuted },
  hint: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  description: { fontSize: 16, lineHeight: 22, color: colors.text },
});
