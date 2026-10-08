import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, useFocusEffect, useRouter, type Href } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BidCountdown } from '@/components/BidCountdown';
import { BidForm } from '@/components/BidForm';
import { DemandCard } from '@/components/DemandCard';
import { OrderContact } from '@/components/OrderContact';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Loader,
  SectionTitle,
} from '@/components/ui';
import {
  ApiError,
  createBid,
  fetchMyCompanyPin,
  fetchMyDocuments,
  fetchMyEquipment,
  fetchOpenOrders,
  fetchProviderBookings,
  updateEquipment,
  type CompanyPin,
  type DocumentsSummary,
  type Equipment,
  type EquipmentStatus,
  type Order,
  type ProviderBooking,
} from '@/lib/api';
import { deliveryEstimate, isBidWindowOpen } from '@/lib/providerFeed';
import { EQUIPMENT_STATUS_OPTIONS, formatMoney, pluralizeRu } from '@/lib/format';
import {
  addressFromDescription,
  categoryIcon,
  distanceKm,
  formatDistance,
  monthIncome,
  orderDays,
  priceByRate,
  relativeDay,
} from '@/lib/orderFlow';
import { setProviderOnline, usePrefs } from '@/lib/prefs';
import { colors, radius, shadow, spacing, TAP, typography } from '@/theme';

/** На линии лента обновляется сама раз в минуту. */
const POLL_MS = 60_000;

const STATUS_COLORS: Record<string, string> = {
  AVAILABLE: colors.success,
  RENTED: colors.primary,
  IN_MAINTENANCE: colors.textSoft,
  RETIRED: colors.textSoft,
};

const SHORT_STATUS: Record<string, string> = {
  AVAILABLE: 'свободна',
  RENTED: 'занята',
  IN_MAINTENANCE: 'ремонт',
  RETIRED: 'снята',
};

function OnlineSwitch({ online, onToggle }: { online: boolean; onToggle: () => void }) {
  return (
    <View style={[styles.lineCard, online && styles.lineCardOnline]}>
      <View style={styles.lineHeader}>
        <View style={[styles.lineDot, online && styles.lineDotOnline]} />
        <Text style={styles.lineTitle}>{online ? 'Вы на линии' : 'Вы не на линии'}</Text>
      </View>
      <Text style={styles.lineHint}>
        {online
          ? 'Новые заявки появляются в ленте, она обновляется сама.'
          : 'Выйдите на линию, чтобы видеть заявки и брать заказы.'}
      </Text>
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel="На линии"
        accessibilityState={{ checked: online }}
        onPress={onToggle}
        style={({ pressed }) => [
          styles.lineButton,
          online ? styles.lineButtonOff : styles.lineButtonOn,
          pressed && styles.pressed,
        ]}
      >
        <Ionicons
          name={online ? 'pause-circle-outline' : 'power'}
          size={22}
          color={online ? colors.onDark : colors.onPrimary}
        />
        <Text style={styles.lineButtonText}>{online ? 'Уйти с линии' : 'Выйти на линию'}</Text>
      </Pressable>
      <Text style={styles.lineNote}>
        Статус хранится только на этом телефоне — заказчики его пока не видят.
      </Text>
    </View>
  );
}

function FleetStrip({
  equipment,
  onChange,
}: {
  equipment: Equipment[];
  onChange: (item: Equipment, status: EquipmentStatus) => void;
}) {
  const router = useRouter();
  const choose = (item: Equipment) => {
    Alert.alert(
      item.name,
      'Статус машины',
      [
        ...EQUIPMENT_STATUS_OPTIONS.filter((option) => option.value !== 'RETIRED').map(
          (option) => ({
            text: option.value === item.status ? `✓ ${option.label}` : option.label,
            onPress: () => onChange(item, option.value),
          }),
        ),
        { text: 'Отмена', style: 'cancel' as const },
      ],
      { cancelable: true },
    );
  };
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.fleet}
    >
      {equipment
        .filter((item) => item.status !== 'RETIRED')
        .map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={`${item.name}: ${SHORT_STATUS[item.status] ?? item.status}. Изменить статус`}
            onPress={() => choose(item)}
            style={({ pressed }) => [styles.fleetChip, pressed && styles.pressed]}
          >
            <View
              style={[
                styles.fleetDot,
                { backgroundColor: STATUS_COLORS[item.status] ?? colors.textSoft },
              ]}
            />
            <Text style={styles.fleetName} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.fleetStatus}>{SHORT_STATUS[item.status] ?? item.status}</Text>
          </Pressable>
        ))}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Добавить технику"
        onPress={() => router.push('/provider/equipment/new')}
        style={({ pressed }) => [styles.fleetChip, styles.fleetAdd, pressed && styles.pressed]}
      >
        <Ionicons name="add" size={18} color={colors.primaryDark} />
        <Text style={styles.fleetAddText}>Техника</Text>
      </Pressable>
    </ScrollView>
  );
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View style={styles.stat} accessibilityLabel={`${label}: ${value}${hint ? `, ${hint}` : ''}`}>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.statLabel} numberOfLines={2}>
        {label}
      </Text>
      {hint ? (
        <Text style={styles.statHint} numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

interface Tip {
  id: string;
  done: boolean;
  title: string;
  href: Href;
}

function TipsCard({ tips }: { tips: Tip[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const left = tips.filter((tip) => !tip.done);
  if (left.length === 0) return null;
  return (
    <Card style={styles.tips}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={styles.tipsHeader}
      >
        <Ionicons name="help-buoy-outline" size={22} color={colors.primaryDark} />
        <View style={styles.flex}>
          <Text style={styles.tipsTitle}>Почему нет заказов?</Text>
          <Text style={styles.tipsSub}>
            {pluralizeRu(left.length, ['шаг', 'шага', 'шагов'])} — и заказчики чаще выбирают вас
          </Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
      </Pressable>
      {open
        ? tips.map((tip) => (
            <Pressable
              key={tip.id}
              accessibilityRole="button"
              disabled={tip.done}
              onPress={() => router.push(tip.href)}
              style={styles.tipRow}
            >
              <Ionicons
                name={tip.done ? 'checkmark-circle' : 'ellipse-outline'}
                size={20}
                color={tip.done ? colors.success : colors.textSoft}
              />
              <Text style={[styles.tipText, tip.done && styles.tipDone]}>{tip.title}</Text>
              {!tip.done ? (
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              ) : null}
            </Pressable>
          ))
        : null}
    </Card>
  );
}

function FeedCard({
  order,
  machine,
  base,
  pricePerKm,
  open,
  submitted,
  equipment,
  taking,
  onOpen,
  onClose,
  onSubmitted,
  onTake,
}: {
  order: Order;
  machine: Equipment | null;
  base: { lat: number; lon: number } | null;
  /** Цена подачи за км компании (оценка подачи на карточке). */
  pricePerKm: string | number | null | undefined;
  open: boolean;
  submitted: boolean;
  equipment: Equipment[];
  taking: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSubmitted: (orderId: string) => void;
  onTake: (order: Order, machine: Equipment) => void;
}) {
  const days = orderDays(order.desiredStartDate, order.desiredEndDate);
  const address = order.location?.addressLine || addressFromDescription(order.description);
  const lat = order.location?.latitude;
  const lon = order.location?.longitude;
  const km =
    base && typeof lat === 'number' && typeof lon === 'number'
      ? distanceKm(base, { lat, lon })
      : null;
  const distance = km !== null ? formatDistance(km) : null;
  const delivery = deliveryEstimate(km, pricePerKm);
  const ownBid = order.bids.find((bid) => bid.status === 'PENDING');
  const byRate = machine ? priceByRate(machine.dailyRate, days) : 0;
  const bidCount = order.bidCount ?? order.bids.length;

  return (
    <Card style={styles.order}>
      <View style={styles.orderTop}>
        <Text style={styles.orderIcon}>{categoryIcon(order.category?.name)}</Text>
        <View style={styles.flex}>
          <Text style={styles.orderCategory} numberOfLines={1}>
            {order.category?.name ?? 'Любая техника'}
          </Text>
          <Text style={styles.orderWhen}>
            {relativeDay(order.desiredStartDate)} ·{' '}
            {days === 1 ? '1 смена' : pluralizeRu(days, ['день', 'дня', 'дней'])}
          </Text>
        </View>
        {distance ? (
          <Badge
            text={delivery !== null ? `${distance} · подача ≈ ${formatMoney(delivery)}` : distance}
            tone="dark"
          />
        ) : null}
      </View>
      <BidCountdown bidsUntil={order.bidsUntil} />
      {address ? (
        <View style={styles.orderPlace}>
          <Ionicons name="location-outline" size={16} color={colors.primary} />
          <Text style={styles.orderPlaceText} numberOfLines={2}>
            {address}
          </Text>
        </View>
      ) : null}
      <Text style={styles.orderText} numberOfLines={3}>
        {order.description}
      </Text>
      <Text style={styles.orderMeta}>
        {order.customer?.name ? `${order.customer.name} · ` : ''}
        {bidCount === 0
          ? 'Предложений ещё нет — будьте первым'
          : pluralizeRu(bidCount, ['предложение', 'предложения', 'предложений'])}
      </Text>
      <OrderContact order={order} />

      {submitted ? (
        <Badge text="Предложение отправлено" tone="success" />
      ) : open ? (
        <BidForm
          order={order}
          equipment={equipment}
          suggestedDelivery={delivery}
          onCancel={onClose}
          onSubmitted={onSubmitted}
        />
      ) : ownBid ? (
        <View style={styles.ownBid}>
          <Text style={styles.ownBidText}>
            Ваше предложение: {formatMoney(ownBid.price, ownBid.currency)}
          </Text>
          <Button title="Изменить" variant="secondary" onPress={onOpen} />
        </View>
      ) : (
        <View style={styles.orderActions}>
          {machine && byRate > 0 ? (
            <Button
              title={`Беру по прайсу · ${formatMoney(byRate, machine.currency)}`}
              loading={taking}
              onPress={() => onTake(order, machine)}
            />
          ) : null}
          <Button
            title="Предложить цену"
            variant={machine && byRate > 0 ? 'secondary' : 'primary'}
            onPress={onOpen}
          />
        </View>
      )}
      <Link href={{ pathname: '/orders/[id]', params: { id: order.id } }} style={styles.orderLink}>
        Подробнее о заявке
      </Link>
    </Card>
  );
}

/**
 * «Лента» — главная исполнителя: «На линии», статусы машин, сводка за месяц,
 * подсказки «Почему нет заказов?» и заявки заказчиков с «Беру по прайсу» и
 * «Предложить цену». Данные — из существующих API; «На линии» — только на телефоне.
 */
export default function FeedScreen() {
  const { online } = usePrefs();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [bookings, setBookings] = useState<ProviderBooking[]>([]);
  const [pin, setPin] = useState<CompanyPin | null>(null);
  const [documents, setDocuments] = useState<DocumentsSummary | null>(null);
  // Карточки с истёкшим сроком приёма предложений прячутся; «сейчас» обновляется раз в минуту.
  const [now, setNow] = useState(() => new Date());
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openBidFor, setOpenBidFor] = useState<string | null>(null);
  const [takingId, setTakingId] = useState<string | null>(null);
  const [submittedIds, setSubmittedIds] = useState<Set<string>>(new Set());

  const load = useCallback(async (mode: 'initial' | 'refresh' | 'silent' = 'initial') => {
    if (mode === 'refresh') setRefreshing(true);
    if (mode !== 'silent') setError(null);
    try {
      const [ordersResult, equipmentResult, bookingsResult, pinResult, documentsResult] =
        await Promise.allSettled([
          fetchOpenOrders(),
          fetchMyEquipment(),
          fetchProviderBookings(),
          fetchMyCompanyPin(),
          fetchMyDocuments(),
        ]);
      if (ordersResult.status === 'fulfilled') {
        setOrders(ordersResult.value.orders.filter((order) => order.status === 'OPEN'));
        setNow(new Date());
      }
      if (equipmentResult.status === 'fulfilled') setEquipment(equipmentResult.value.equipment);
      if (bookingsResult.status === 'fulfilled') setBookings(bookingsResult.value.bookings);
      if (pinResult.status === 'fulfilled') setPin(pinResult.value.company);
      if (documentsResult.status === 'fulfilled') setDocuments(documentsResult.value.summary);
      if (ordersResult.status === 'rejected') throw ordersResult.reason;
    } catch (caught) {
      if (mode !== 'silent') {
        setError(caught instanceof ApiError ? caught.message : 'Не удалось загрузить заявки');
      }
      setOrders((prev) => prev ?? []);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      if (!online) return undefined;
      const timer = setInterval(() => void load('silent'), POLL_MS);
      return () => clearInterval(timer);
    }, [load, online]),
  );
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const openOrders = useMemo(
    () => (orders ?? []).filter((order) => isBidWindowOpen(order, now)),
    [orders, now],
  );

  const available = useMemo(
    () => equipment.filter((item) => item.status === 'AVAILABLE'),
    [equipment],
  );
  const base =
    pin && typeof pin.baseLat === 'number' && typeof pin.baseLon === 'number'
      ? { lat: pin.baseLat, lon: pin.baseLon }
      : null;

  const changeStatus = async (item: Equipment, status: EquipmentStatus) => {
    if (item.status === status) return;
    const previous = item.status;
    setEquipment((prev) => prev.map((row) => (row.id === item.id ? { ...row, status } : row)));
    try {
      await updateEquipment(item.id, { status });
    } catch (caught) {
      setEquipment((prev) =>
        prev.map((row) => (row.id === item.id ? { ...row, status: previous } : row)),
      );
      Alert.alert(
        'Ошибка',
        caught instanceof ApiError ? caught.message : 'Не удалось изменить статус',
      );
    }
  };

  const markSubmitted = (orderId: string) => {
    setSubmittedIds((prev) => new Set(prev).add(orderId));
    setOpenBidFor(null);
  };

  const take = (order: Order, machine: Equipment) => {
    const days = orderDays(order.desiredStartDate, order.desiredEndDate);
    const price = priceByRate(machine.dailyRate, days);
    Alert.alert(
      'Беру по прайсу',
      `${machine.name}: ${formatMoney(price, machine.currency)} за ${days === 1 ? '1 смену' : pluralizeRu(days, ['день', 'дня', 'дней'])}. Заказчик увидит предложение и сможет выбрать вас.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Отправить',
          onPress: async () => {
            setTakingId(order.id);
            try {
              await createBid(order.id, {
                equipmentId: machine.id,
                price,
                message: `Беру по прайсу: ${machine.name}, ${formatMoney(machine.dailyRate, machine.currency)} за смену × ${days}.`,
              });
              markSubmitted(order.id);
            } catch (caught) {
              Alert.alert(
                'Ошибка',
                caught instanceof ApiError ? caught.message : 'Не удалось отправить предложение',
              );
            } finally {
              setTakingId(null);
            }
          },
        },
      ],
    );
  };

  if (orders === null) return <Loader />;

  const active = bookings.filter((b) => b.status === 'CONFIRMED' || b.status === 'ACTIVE').length;
  const waiting = bookings.filter((b) => b.status === 'PENDING').length;
  const income = monthIncome(bookings);
  const monthName = new Date().toLocaleDateString('ru-RU', { month: 'long' });
  const tips: Tip[] = [
    {
      id: 'fleet',
      done: equipment.length > 0,
      title: 'Добавьте технику с ценой',
      href: '/provider/equipment/new',
    },
    {
      id: 'photos',
      done: equipment.length > 0 && equipment.every((item) => item.imageUrls.length > 0),
      title: 'Загрузите свои фото машин — без них доверия меньше',
      href: '/(tabs)/provider',
    },
    {
      id: 'base',
      done: base !== null,
      title: 'Укажите базу на карте — заказчики выбирают ближайших',
      href: '/(tabs)/provider',
    },
    {
      id: 'hourly',
      done: equipment.length > 0 && equipment.every((item) => Number(item.hourlyRate ?? 0) > 0),
      title: 'Укажите цену за час — так проще сравнивать',
      href: '/(tabs)/provider',
    },
    {
      id: 'available',
      done: available.length > 0,
      title: 'Отметьте хотя бы одну машину «Свободна»',
      href: '/(tabs)/provider',
    },
    {
      id: 'online',
      done: online,
      title: 'Будьте на линии и отвечайте быстро',
      href: '/(tabs)/feed',
    },
    {
      id: 'documents',
      done: (documents?.expired ?? 0) === 0,
      title: `Продлите просроченные документы${documents?.expired ? ` (${documents.expired})` : ''}`,
      href: '/provider/documents',
    },
  ];

  const machineFor = (order: Order): Equipment | null =>
    (order.category
      ? available.find((item) => item.category.id === order.category?.id)
      : available[0]) ?? null;

  const header = (
    <View style={styles.header}>
      <OnlineSwitch online={online} onToggle={() => setProviderOnline(!online)} />
      {equipment.length > 0 ? <FleetStrip equipment={equipment} onChange={changeStatus} /> : null}
      <View style={styles.stats}>
        <StatTile
          label="Активные брони"
          value={String(active)}
          hint={waiting > 0 ? `+${waiting} ждут ответа` : undefined}
        />
        <StatTile label={`Доход, ${monthName}`} value={formatMoney(income)} hint="по броням" />
        <StatTile label="Рейтинг" value="—" hint="после отзывов" />
      </View>
      {waiting > 0 ? (
        <Link href="/(tabs)/jobs" asChild>
          <Button
            title={`Подтвердите ${pluralizeRu(waiting, ['бронь', 'брони', 'броней'])}`}
            variant="dark"
          />
        </Link>
      ) : null}
      <TipsCard tips={tips} />
      <DemandCard />
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      <SectionTitle>
        {online
          ? `Заявки заказчиков${openOrders.length > 0 ? ` · ${openOrders.length}` : ''}`
          : 'Заявки скрыты'}
      </SectionTitle>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <FlatList
        data={online ? openOrders : []}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <FeedCard
            order={item}
            machine={machineFor(item)}
            base={base}
            pricePerKm={pin?.deliveryPricePerKm}
            open={openBidFor === item.id}
            submitted={submittedIds.has(item.id)}
            equipment={available}
            taking={takingId === item.id}
            onOpen={() => setOpenBidFor(item.id)}
            onClose={() => setOpenBidFor(null)}
            onSubmitted={markSubmitted}
            onTake={take}
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
        ListHeaderComponent={header}
        ListEmptyComponent={
          online ? (
            !error ? (
              <EmptyState
                title="Открытых заявок нет"
                description="Как только заказчик опубликует заявку, она появится здесь."
              />
            ) : null
          ) : (
            <EmptyState
              title={
                openOrders.length > 0
                  ? `${pluralizeRu(openOrders.length, ['заявка ждёт', 'заявки ждут', 'заявок ждут'])} исполнителя`
                  : 'Вы не на линии'
              }
              description="Нажмите «Выйти на линию», чтобы увидеть заявки."
            />
          )
        }
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.85 },
  list: { padding: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
  header: { gap: spacing.md, marginBottom: spacing.md },
  lineCard: {
    backgroundColor: colors.dark,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadow.card,
  },
  lineCardOnline: { backgroundColor: colors.darkSoft },
  lineHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  lineDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.textSoft },
  lineDotOnline: { backgroundColor: '#3DDC84' },
  lineTitle: { ...typography.title, color: colors.onDark },
  lineHint: { color: colors.onDarkMuted, fontSize: 14, lineHeight: 20 },
  lineButton: {
    marginTop: spacing.xs,
    minHeight: 60,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  lineButtonOn: { backgroundColor: colors.primary },
  lineButtonOff: { backgroundColor: 'rgba(255,255,255,0.12)' },
  lineButtonText: { color: colors.onDark, fontSize: 18, fontWeight: '800' },
  lineNote: { color: colors.onDarkMuted, fontSize: 12 },
  fleet: { gap: spacing.sm, paddingVertical: 2 },
  fleetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: TAP,
    maxWidth: 240,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fleetDot: { width: 10, height: 10, borderRadius: 5 },
  fleetName: { fontSize: 14, fontWeight: '600', color: colors.text, flexShrink: 1 },
  fleetStatus: { fontSize: 13, color: colors.textMuted },
  fleetAdd: { borderStyle: 'dashed', borderColor: colors.primary },
  fleetAddText: { fontSize: 14, fontWeight: '700', color: colors.primaryDark },
  stats: { flexDirection: 'row', gap: spacing.sm },
  stat: {
    flex: 1,
    minHeight: 92,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 2,
  },
  statValue: { fontSize: 20, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: 12, color: colors.textMuted, lineHeight: 16 },
  statHint: { fontSize: 11, color: colors.primaryDark, fontWeight: '600' },
  tips: { gap: spacing.sm, padding: spacing.md },
  tipsHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: TAP },
  tipsTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  tipsSub: { fontSize: 13, color: colors.textMuted },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  tipText: { flex: 1, fontSize: 14, color: colors.text },
  tipDone: { color: colors.textMuted, textDecorationLine: 'line-through' },
  order: { gap: spacing.sm },
  orderTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  orderIcon: { fontSize: 30 },
  orderCategory: { fontSize: 17, fontWeight: '800', color: colors.text },
  orderWhen: { fontSize: 14, color: colors.primaryDark, fontWeight: '700' },
  orderPlace: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  orderPlaceText: { flex: 1, fontSize: 14, color: colors.text },
  orderText: { fontSize: 15, lineHeight: 21, color: colors.text },
  orderMeta: { fontSize: 13, color: colors.textMuted },
  orderActions: { gap: spacing.sm },
  ownBid: { gap: spacing.sm },
  ownBidText: { fontSize: 15, fontWeight: '700', color: colors.primaryDark },
  orderLink: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.xs,
  },
});
