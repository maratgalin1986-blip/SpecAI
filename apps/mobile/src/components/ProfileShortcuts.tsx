import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter, type Href } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { isProviderMode, setAppMode, usePrefs } from '@/lib/prefs';
import { colors, radius, spacing, TAP } from '@/theme';

/**
 * Переключатель «Режим заказчика / Кабинет исполнителя» — только у
 * исполнителей. Режим хранится на телефоне; роль на сервере не меняется.
 */
export function ModeSwitchCard() {
  const router = useRouter();
  const { user } = useAuth();
  const { mode } = usePrefs();
  if (user?.role !== 'PROVIDER_ADMIN') return null;
  const providerMode = isProviderMode(user.role, mode);

  const toggle = () => {
    if (providerMode) {
      setAppMode('customer');
      router.replace('/(tabs)');
    } else {
      setAppMode('provider');
      router.replace('/(tabs)/feed');
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={providerMode ? 'Перейти в режим заказчика' : 'Вернуться в кабинет'}
      onPress={toggle}
      style={({ pressed }) => [styles.mode, pressed && styles.pressed]}
    >
      <Ionicons name="swap-horizontal" size={24} color={colors.primary} />
      <View style={styles.flex}>
        <Text style={styles.modeTitle}>
          {providerMode ? 'Режим заказчика' : 'Кабинет исполнителя'}
        </Text>
        <Text style={styles.modeText}>
          {providerMode
            ? 'Закажите технику у других исполнителей сервиса'
            : 'Сейчас вы заказываете как заказчик. Вернуться к ленте заявок'}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.onDarkMuted} />
    </Pressable>
  );
}

const CUSTOMER_LINKS: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  href: Href;
}[] = [
  {
    icon: 'calendar-outline',
    label: 'Мои брони',
    href: { pathname: '/(tabs)/orders', params: { view: 'bookings' } },
  },
  { icon: 'grid-outline', label: 'Каталог техники', href: '/catalog' },
  { icon: 'map-outline', label: 'Исполнители на карте', href: '/map' },
];

const PROVIDER_LINKS: typeof CUSTOMER_LINKS = [
  { icon: 'chatbubble-ellipses-outline', label: 'Помощник', href: '/(tabs)/chat' },
  { icon: 'map-outline', label: 'Карта исполнителей', href: '/map' },
];

/** Быстрые ссылки профиля: разделы, которых нет на панели вкладок. */
export function ProfileShortcuts() {
  const router = useRouter();
  const { user } = useAuth();
  const { mode } = usePrefs();
  const links = isProviderMode(user?.role, mode) ? PROVIDER_LINKS : CUSTOMER_LINKS;
  return (
    <Card style={styles.links}>
      {[
        ...links,
        { icon: 'heart-outline' as const, label: 'О сервисе и контакты', href: '/about' as Href },
      ].map((link, index) => (
        <Pressable
          key={link.label}
          accessibilityRole="link"
          onPress={() => router.push(link.href)}
          style={({ pressed }) => [
            styles.link,
            index > 0 && styles.linkBorder,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name={link.icon} size={22} color={colors.text} />
          <Text style={styles.linkText}>{link.label}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textSoft} />
        </Pressable>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.85 },
  mode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.dark,
    minHeight: 72,
  },
  modeTitle: { color: colors.onDark, fontSize: 17, fontWeight: '800' },
  modeText: { color: colors.onDarkMuted, fontSize: 13, lineHeight: 18, marginTop: 2 },
  links: { paddingVertical: 0, paddingHorizontal: spacing.lg },
  link: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: TAP + 8 },
  linkBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  linkText: { flex: 1, fontSize: 16, color: colors.text, fontWeight: '500' },
});
