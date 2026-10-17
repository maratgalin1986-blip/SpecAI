import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter, type Href } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useSwitchMode } from '@/components/ModeSwitch';
import { modeSwitchKind } from '@/lib/modes';
import { isProviderMode, usePrefs } from '@/lib/prefs';
import { colors, radius, spacing, TAP } from '@/theme';

/**
 * Один вход — два режима. Исполнитель переключается «Заказчик ⇄ Исполнитель»
 * (режим хранится на телефоне, роль на сервере не меняется); заказчик видит
 * «Стать исполнителем». Машинисту карточка не показывается (lib/modes.ts).
 */
export function ModeSwitchCard() {
  const router = useRouter();
  const { user } = useAuth();
  const { mode } = usePrefs();
  const switchMode = useSwitchMode();
  const kind = modeSwitchKind(user?.role);
  if (kind === 'none') return null;

  if (kind === 'become') {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Стать исполнителем"
        onPress={() => router.push('/become-provider')}
        style={({ pressed }) => [styles.mode, pressed && styles.pressed]}
      >
        <Ionicons name="construct-outline" size={24} color={colors.primary} />
        <View style={styles.flex}>
          <Text style={styles.modeTitle}>Стать исполнителем</Text>
          <Text style={styles.modeText}>Добавьте свою технику и получайте заявки</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.onDarkMuted} />
      </Pressable>
    );
  }

  const providerMode = isProviderMode(user?.role, mode);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        providerMode ? 'Перейти в режим «Заказчик»' : 'Перейти в режим «Исполнитель»'
      }
      onPress={() => switchMode(providerMode ? 'customer' : 'provider')}
      style={({ pressed }) => [styles.mode, pressed && styles.pressed]}
    >
      <Ionicons name="swap-horizontal" size={24} color={colors.primary} />
      <View style={styles.flex}>
        <Text style={styles.modeTitle}>
          {providerMode ? 'Перейти в режим «Заказчик»' : 'Перейти в режим «Исполнитель»'}
        </Text>
        <Text style={styles.modeText}>
          {providerMode
            ? 'Сейчас вы исполнитель. Закажите технику у других исполнителей сервиса'
            : 'Сейчас вы заказчик. Вернуться к ленте заявок и своей технике'}
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

/** Машинист: только его смены, без разделов заказчика. */
const OPERATOR_LINKS: typeof CUSTOMER_LINKS = [
  { icon: 'timer-outline', label: 'Мои смены', href: '/(tabs)/shifts' },
];

/** Быстрые ссылки профиля: разделы, которых нет на панели вкладок. */
export function ProfileShortcuts() {
  const router = useRouter();
  const { user } = useAuth();
  const { mode } = usePrefs();
  const links =
    user?.role === 'PROVIDER_OPERATOR'
      ? OPERATOR_LINKS
      : isProviderMode(user?.role, mode)
        ? PROVIDER_LINKS
        : CUSTOMER_LINKS;
  return (
    <Card style={styles.links}>
      {[
        ...links,
        { icon: 'help-circle-outline' as const, label: 'Как пользоваться', href: '/guide' as Href },
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
