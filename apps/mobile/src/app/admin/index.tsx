import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter, type Href } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AdminGate } from '@/components/AdminGate';
import { Button, Card, ErrorBanner } from '@/components/ui';
import { fetchAdminStats } from '@/lib/adminApi';
import { badgeCount, formatCount, moderationTotal } from '@/lib/adminFormat';
import { clearAdminSession } from '@/lib/adminSession';
import { API_URL } from '@/lib/api';
import { useAdminData } from '@/lib/useAdminData';
import { colors, radius, spacing, TAP, typography } from '@/theme';

export default function AdminMenuScreen() {
  return (
    <AdminGate>
      <AdminMenu />
    </AdminGate>
  );
}

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function AdminMenu() {
  const router = useRouter();
  const { data: stats, error, refreshing, refresh } = useAdminData(fetchAdminStats);

  const logout = () => {
    Alert.alert('Выйти из меню администратора?', 'Ваш аккаунт в приложении останется.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Выйти',
        style: 'destructive',
        onPress: () => {
          void clearAdminSession();
          if (router.canGoBack()) router.back();
        },
      },
    ]);
  };

  const items: {
    icon: IconName;
    title: string;
    text: string;
    badge?: string | null;
    href: Href;
  }[] = [
    {
      icon: 'stats-chart-outline',
      title: 'Сводка',
      text: stats
        ? `Заказчики ${formatCount(stats.customers.total)} · Исполнители ${formatCount(stats.providers.total)}`
        : 'Сколько заказчиков и исполнителей зарегистрировалось',
      href: '/admin/stats',
    },
    {
      icon: 'star-half-outline',
      title: 'Модерация',
      text: 'Отзывы и комментарии видны людям только после вашего решения',
      badge: badgeCount(moderationTotal(stats)),
      href: '/admin/moderation',
    },
    {
      icon: 'chatbubbles-outline',
      title: 'Заявки из чатов',
      text: 'Заявки из Telegram и WhatsApp ждут публикации',
      badge: badgeCount(stats?.chatOrders),
      href: '/admin/orders',
    },
    {
      icon: 'business-outline',
      title: 'Исполнители',
      text: 'Компании и отметка «Проверен»',
      href: '/admin/providers',
    },
    {
      icon: 'heart-outline',
      title: 'Поддержка (донаты)',
      text: 'Номер карты для добровольной поддержки после заказа',
      href: '/admin/support',
    },
  ];

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
    >
      {error ? <ErrorBanner message={error} onRetry={() => void refresh()} /> : null}

      <Card style={styles.list}>
        {items.map((item, index) => (
          <Pressable
            key={item.title}
            accessibilityRole="button"
            accessibilityLabel={
              item.badge ? `${item.title}, ждут решения: ${item.badge}` : item.title
            }
            onPress={() => router.push(item.href)}
            style={({ pressed }) => [
              styles.row,
              index > 0 && styles.rowBorder,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name={item.icon} size={24} color={colors.primary} />
            <View style={styles.flex}>
              <Text style={styles.rowTitle}>{item.title}</Text>
              <Text style={styles.rowText}>{item.text}</Text>
            </View>
            {item.badge ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.badge}</Text>
              </View>
            ) : null}
            <Ionicons name="chevron-forward" size={18} color={colors.textSoft} />
          </Pressable>
        ))}
      </Card>

      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Полная админка на сайте"
        onPress={() => void WebBrowser.openBrowserAsync(`${API_URL}/admin`)}
        style={({ pressed }) => [styles.site, pressed && styles.pressed]}
      >
        <Ionicons name="open-outline" size={22} color={colors.onDark} />
        <View style={styles.flex}>
          <Text style={styles.siteTitle}>Полная админка на сайте</Text>
          <Text style={styles.siteText}>
            Звонки, воронка, поиск. Откроется в браузере, пароль тот же
          </Text>
        </View>
      </Pressable>

      <Button title="Выйти из админки" variant="secondary" onPress={logout} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.85 },
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  list: { paddingVertical: 0, paddingHorizontal: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: TAP + 16,
    paddingVertical: spacing.md,
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  rowTitle: { ...typography.bodyStrong, color: colors.text },
  rowText: { ...typography.small, color: colors.textMuted },
  badge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.onPrimary, fontWeight: '800', fontSize: 14 },
  site: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: TAP + 16,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.dark,
  },
  siteTitle: { ...typography.bodyStrong, color: colors.onDark },
  siteText: { ...typography.small, color: colors.onDarkMuted },
});
