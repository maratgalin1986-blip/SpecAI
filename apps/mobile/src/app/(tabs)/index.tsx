import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActivityStrip } from '@/components/ActivityStrip';
import { HelpButton, ModeSwitch } from '@/components/ModeSwitch';
import { ProvidersMap } from '@/components/ProvidersMap';
import { QuickOrderSheet } from '@/components/QuickOrderSheet';
import { AI_ENTRY_HINT, AI_ENTRY_TITLE } from '@/lib/aiDispatcher';
import { fetchMyOrders, type Order } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useActivity } from '@/lib/useActivity';
import { useNearbyLine } from '@/lib/useNearbyLine';
import { pluralizeRu } from '@/lib/format';
import { categoryIcon, pointAddress } from '@/lib/orderFlow';
import { isProviderMode, usePrefs } from '@/lib/prefs';
import { SITE } from '@/lib/site';
import { colors, radius, shadow, spacing, TAP } from '@/theme';

const ACTIVE_WINDOW_MS = 30 * 86_400_000;

/** Последняя незакрытая заявка — показываем её поверх карты, как текущую поездку. */
function pickActiveOrder(orders: Order[]): Order | null {
  const now = Date.now();
  return (
    orders.find(
      (order) =>
        (order.status === 'OPEN' || order.status === 'MATCHED') &&
        now - new Date(order.createdAt).getTime() < ACTIVE_WINDOW_MS &&
        new Date(order.desiredEndDate).getTime() > now - 86_400_000,
    ) ?? null
  );
}

/**
 * Главная заказчика: карта исполнителей на весь экран и шторка быстрого
 * заказа снизу. Сверху — бренд, каталог, «?» (как пользоваться) и у
 * исполнителя переключатель «Заказчик | Исполнитель».
 */
export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isProvider = user?.role === 'PROVIDER_ADMIN';
  const [active, setActive] = useState<Order | null>(null);
  // «Вызвать сюда»: a tap on the map becomes the order's address.
  const [pickedAddress, setPickedAddress] = useState<string | null>(null);
  const { loaded, mode } = usePrefs();
  // Вы на карте и техника на линии вокруг (владелец, 2026-10-15) — только
  // когда карта заказчика действительно показана: исполнителя и машиниста
  // уводят отсюда ниже, им ни запрос геопозиции, ни опрос карты не нужны.
  const showsCustomerMap =
    !!user && user.role !== 'PROVIDER_OPERATOR' && (!isProvider || (loaded && mode === 'customer'));
  const { me, machines, base } = useNearbyLine(showsCustomerMap);
  // «Сегодня: N заявок · M машин на линии рядом» — настоящие числа площадки.
  const activity = useActivity(showsCustomerMap);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      fetchMyOrders()
        .then((data) => !cancelled && setActive(pickActiveOrder(data.orders)))
        .catch(() => undefined);
      return () => {
        cancelled = true;
      };
    }, []),
  );

  // Машинист видит только свои смены: после входа с экрана логина роутер
  // открывает первую вкладку, поэтому уводим его отсюда.
  if (user?.role === 'PROVIDER_OPERATOR') return <Redirect href="/(tabs)/shifts" />;
  // Исполнитель в своём кабинете начинает с «Ленты».
  if (isProvider && !loaded) return <View style={styles.screen} />;
  if (isProviderMode(user?.role, mode)) return <Redirect href="/(tabs)/feed" />;

  const activeBids = active ? (active.bidCount ?? active.bids.length) : 0;

  return (
    <View style={styles.screen}>
      <ProvidersMap
        style={StyleSheet.absoluteFill}
        onPick={(point) => setPickedAddress(pointAddress(point))}
        live={machines}
        base={base}
        me={me}
        onMachine={(equipmentId) => router.push(`/equipment/${equipmentId}`)}
      />

      <View
        style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}
        pointerEvents="box-none"
      >
        <View style={styles.brand} accessibilityRole="header">
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>СП</Text>
          </View>
          <Text style={styles.brandText} numberOfLines={1}>
            {SITE.name}
          </Text>
        </View>
        <View style={styles.topActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Исполнители"
            onPress={() => router.push('/providers')}
            style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}
          >
            <Ionicons name="people-outline" size={22} color={colors.text} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Каталог техники"
            onPress={() => router.push('/catalog')}
            style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}
          >
            <Ionicons name="grid-outline" size={22} color={colors.text} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Карта на весь экран"
            onPress={() => router.push('/map')}
            style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}
          >
            <Ionicons name="expand-outline" size={22} color={colors.text} />
          </Pressable>
        </View>
      </View>
      <View
        style={[styles.secondRow, { top: insets.top + spacing.sm + TAP + spacing.sm }]}
        pointerEvents="box-none"
      >
        {/* Исполнитель в режиме заказчика возвращается к ленте одним касанием. */}
        <ModeSwitch style={styles.modeSwitch} />
        <View style={styles.flex} pointerEvents="none" />
        <HelpButton />
      </View>
      <View
        style={[styles.thirdRow, { top: insets.top + spacing.sm + (TAP + spacing.sm) * 2 }]}
        pointerEvents="box-none"
      >
        {/* «рядом» — только когда карта знает, где заказчик. */}
        <ActivityStrip activity={activity} nearOnline={me ? machines.length : null} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.bottom}
        pointerEvents="box-none"
      >
        {/* ИИ-диспетчер подписан как ИИ: в чате он сразу говорит, что он программа. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${AI_ENTRY_TITLE}. ${AI_ENTRY_HINT}`}
          onPress={() => router.push('/(tabs)/chat')}
          style={({ pressed }) => [styles.aiCard, pressed && styles.pressed]}
        >
          <View style={styles.aiBadge}>
            <Text style={styles.aiBadgeText}>ИИ</Text>
          </View>
          <View style={styles.flexShrink}>
            <Text style={styles.aiTitle} numberOfLines={1}>
              {AI_ENTRY_TITLE}
            </Text>
            <Text style={styles.aiHint} numberOfLines={1}>
              {AI_ENTRY_HINT}
            </Text>
          </View>
          <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.primary} />
        </Pressable>
        {active ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Открыть текущий заказ"
            onPress={() => router.push({ pathname: '/orders/[id]', params: { id: active.id } })}
            style={({ pressed }) => [styles.activeCard, pressed && styles.pressed]}
          >
            <Text style={styles.activeIcon}>{categoryIcon(active.category?.name)}</Text>
            <View style={styles.flex}>
              <Text style={styles.activeTitle} numberOfLines={1}>
                {active.status === 'MATCHED'
                  ? 'Исполнитель выбран'
                  : activeBids > 0
                    ? `${pluralizeRu(activeBids, ['предложение', 'предложения', 'предложений'])} — выберите`
                    : 'Ищем исполнителей…'}
              </Text>
              <Text style={styles.activeMeta} numberOfLines={1}>
                {active.category?.name ?? 'Текущий заказ'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.onDark} />
          </Pressable>
        ) : null}
        <QuickOrderSheet pickedAddress={pickedAddress} />
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surfaceMuted },
  flex: { flex: 1 },
  pressed: { opacity: 0.85 },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  brand: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    paddingLeft: 4,
    paddingRight: spacing.md,
    minHeight: TAP,
    ...shadow.card,
  },
  brandMark: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.dark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkText: { color: colors.primary, fontWeight: '900', fontSize: 15 },
  brandText: { fontSize: 15, fontWeight: '800', color: colors.text, flexShrink: 1 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  secondRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  modeSwitch: { width: 250, flexShrink: 1 },
  thirdRow: { position: 'absolute', left: 0, right: 0, paddingHorizontal: spacing.lg },
  flexShrink: { flexShrink: 1 },
  aiCard: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingVertical: spacing.xs + 2,
    paddingLeft: spacing.xs + 2,
    paddingRight: spacing.md,
    minHeight: TAP,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    ...shadow.card,
  },
  aiBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.dark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiBadgeText: { color: colors.primary, fontWeight: '900', fontSize: 12 },
  aiTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  aiHint: { color: colors.textMuted, fontSize: 12 },
  roundButton: {
    width: TAP,
    height: TAP,
    borderRadius: TAP / 2,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  activeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.md,
    minHeight: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.dark,
    ...shadow.card,
  },
  activeIcon: { fontSize: 24 },
  activeTitle: { color: colors.onDark, fontSize: 15, fontWeight: '700' },
  activeMeta: { color: colors.onDarkMuted, fontSize: 13 },
});
