import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, spacing, TAP } from '@/theme';

/**
 * «Открыть чат» по заявке. Заказчик передаёт `companyId` (переписка с этим
 * исполнителем), исполнитель — нет (сервер откроет переписку его компании).
 * `unread` — бейдж с числом непрочитанных.
 */
export function OrderChatButton({
  orderId,
  companyId,
  name,
  unread = 0,
  variant = 'secondary',
  style,
}: {
  orderId: string;
  companyId?: string;
  /** Заголовок экрана чата (название компании или «Анна П.»). */
  name?: string;
  unread?: number;
  variant?: 'primary' | 'secondary';
  style?: StyleProp<ViewStyle>;
}) {
  const router = useRouter();
  const primary = variant === 'primary';
  const label = unread > 0 ? `Открыть чат · ${unread}` : 'Открыть чат';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={unread > 0 ? `Открыть чат, непрочитанных: ${unread}` : 'Открыть чат'}
      onPress={() =>
        router.push({
          pathname: '/orders/[id]/chat',
          params: {
            id: orderId,
            ...(companyId ? { company: companyId } : {}),
            ...(name ? { name } : {}),
          },
        })
      }
      style={({ pressed }) => [
        styles.button,
        primary ? styles.primary : styles.secondary,
        pressed && styles.pressed,
        style,
      ]}
    >
      <Ionicons
        name="chatbubble-ellipses-outline"
        size={18}
        color={primary ? colors.onPrimary : colors.primaryDark}
      />
      <Text style={[styles.text, primary ? styles.textPrimary : styles.textSecondary]}>
        {label}
      </Text>
      {unread > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: TAP,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  pressed: { opacity: 0.85 },
  text: { fontSize: 16, fontWeight: '700' },
  textPrimary: { color: colors.onPrimary },
  textSecondary: { color: colors.primaryDark },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.onPrimary, fontSize: 12, fontWeight: '800' },
});
