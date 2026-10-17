import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { PROMISE_HOUSE } from '@/lib/promise';
import { SITE } from '@/lib/site';
import { colors, radius, shadow, spacing } from '@/theme';

/**
 * «Бесплатно и без посредников» (владелец, 2026-10-17): главное обещание
 * площадки всегда на виду, но тихо. PromiseNote — одна строка под кнопкой
 * формы, PromiseChip — маленький чип на карте; нажатие объясняет, как это.
 */

/** Пояснение: что, кто назначает цену и как платить. */
export function explainPromise(): void {
  Alert.alert(SITE.promise, `${SITE.promiseDetail}\n\n${PROMISE_HOUSE}`, [{ text: 'Понятно' }]);
}

/** «✓ Бесплатно и без посредников: цену назначает владелец техники…» */
export function PromiseNote({
  style,
  onDark = false,
}: {
  style?: StyleProp<ViewStyle>;
  /** Светлый текст на тёмной карточке. */
  onDark?: boolean;
}) {
  return (
    <View
      style={[styles.note, style]}
      accessible
      accessibilityLabel={`${SITE.promise}. ${SITE.promiseDetail}`}
    >
      <Ionicons name="checkmark-circle" size={16} color={colors.success} style={styles.noteIcon} />
      <Text style={[styles.noteText, onDark && styles.noteTextOnDark]}>
        <Text style={[styles.noteStrong, onDark && styles.noteTextOnDark]}>{SITE.promise}</Text>
        {SITE.promiseLine.slice(SITE.promise.length)}
      </Text>
    </View>
  );
}

/** Чип «Бесплатно · без посредников» поверх карты; нажатие — пояснение. */
export function PromiseChip({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${SITE.promise}. Как это?`}
      accessibilityHint="Показывает, кто назначает цену и как платить"
      onPress={explainPromise}
      hitSlop={8}
      style={({ pressed }) => [styles.chip, pressed && styles.pressed, style]}
    >
      <Ionicons name="checkmark-circle" size={14} color={colors.success} />
      <Text style={styles.chipText} numberOfLines={1}>
        {SITE.promiseShort}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.85 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  noteIcon: { marginTop: 1 },
  noteText: { flex: 1, fontSize: 13, lineHeight: 18, color: colors.textMuted },
  noteStrong: { fontWeight: '700', color: colors.success },
  noteTextOnDark: { color: colors.onDarkMuted },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexShrink: 1,
    gap: spacing.xs,
    minHeight: 32,
    paddingHorizontal: spacing.md - 2,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    ...shadow.card,
  },
  chipText: { flexShrink: 1, fontSize: 12, fontWeight: '700', color: colors.success },
});
