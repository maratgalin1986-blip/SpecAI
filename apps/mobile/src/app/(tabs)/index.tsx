import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MapWebView } from '@/components/MapWebView';
import { QuickOrderSheet } from '@/components/QuickOrderSheet';
import { fetchMyOrders, type Order } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { pluralizeRu } from '@/lib/format';
import { categoryIcon } from '@/lib/orderFlow';
import { isProviderMode, setAppMode, usePrefs } from '@/lib/prefs';
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
 * заказа снизу. Сверху — бренд, каталог и (у исполнителя в «Режиме
 * заказчика») кнопка возврата в кабинет.
 */
export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isProvider = user?.role === 'PROVIDER_ADMIN';
  const [active, setActive] = useState<Order | null>(null);

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

  const { loaded, mode } = usePrefs();
  // Исполнитель в своём кабинете начинает с «Ленты».
  if (isProvider && !loaded) return <View style={styles.screen} />;
  if (isProviderMode(user?.role, mode)) return <Redirect href="/(tabs)/feed" />;

  const activeBids = active ? (active.bidCount ?? active.bids.length) : 0;

  return (
    <View style={styles.screen}>
      <MapWebView style={StyleSheet.absoluteFill} fallbackStyle={{ paddingTop: insets.top + 72 }} />

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
          {isProvider ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Вернуться в кабинет исполнителя"
              onPress={() => {
                setAppMode('provider');
                router.replace('/(tabs)/feed');
              }}
              style={({ pressed }) => [styles.modePill, pressed && styles.pressed]}
            >
              <Ionicons name="swap-horizontal" size={16} color={colors.onDark} />
              <Text style={styles.modePillText}>В кабинет</Text>
            </Pressable>
          ) : null}
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

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.bottom}
        pointerEvents="box-none"
      >
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
        <QuickOrderSheet />
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
  modePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: TAP,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.dark,
    ...shadow.card,
  },
  modePillText: { color: colors.onDark, fontWeight: '700', fontSize: 13 },
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
