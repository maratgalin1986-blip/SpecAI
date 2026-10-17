import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, spacing, TAP } from '@/theme';

export const PROPOSALS_LINK_TEXT = 'Предложения и партнёрство';

/**
 * Тихая строка «Предложения и партнёрство» (владелец, 2026-10-17: «кнопка
 * неброская, нигде не мешается») — в профиле, в «Как пользоваться» и «О
 * компании». Не плавающая кнопка: стоит в потоке экрана, ничего не закрывает.
 */
export function ProposalsLink() {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={PROPOSALS_LINK_TEXT}
      onPress={() => router.push('/proposals')}
      hitSlop={4}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Ionicons name="bulb-outline" size={16} color={colors.textSoft} />
      <Text style={styles.text}>{PROPOSALS_LINK_TEXT}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: TAP,
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
  },
  text: { color: colors.textSoft, fontSize: 14, fontWeight: '500' },
});
