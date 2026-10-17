import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAdminSession } from '@/lib/adminSession';
import { colors, radius, spacing, TAP } from '@/theme';

/**
 * Вход в меню администратора из профиля (и с экрана входа). Пока владелец не
 * ввёл пароль админки — тихая строка внизу; после входа — заметная карточка
 * «Меню администратора». С аккаунтом в приложении не связано.
 */
export function AdminMenuCard() {
  const router = useRouter();
  const { session } = useAdminSession();
  if (!session) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Меню администратора"
      onPress={() => router.push('/admin')}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <Ionicons name="shield-checkmark" size={26} color={colors.onPrimary} />
      <View style={styles.flex}>
        <Text style={styles.cardTitle}>Меню администратора</Text>
        <Text style={styles.cardText}>Регистрации, модерация отзывов, заявки из чатов</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.onPrimary} />
    </Pressable>
  );
}

export function AdminLoginRow() {
  const router = useRouter();
  const { loaded, session } = useAdminSession();
  if (!loaded || session) return null;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel="Вход для администратора"
      onPress={() => router.push('/admin')}
      hitSlop={4}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Ionicons name="lock-closed-outline" size={16} color={colors.textSoft} />
      <Text style={styles.rowText}>Вход для администратора</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.8 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    minHeight: 72,
  },
  cardTitle: { color: colors.onPrimary, fontSize: 17, fontWeight: '800' },
  cardText: { color: colors.onPrimary, fontSize: 13, lineHeight: 18, marginTop: 2, opacity: 0.9 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: TAP,
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
  },
  rowText: { color: colors.textSoft, fontSize: 14, fontWeight: '500' },
});
