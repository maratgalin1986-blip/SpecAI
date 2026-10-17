import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  HINTS,
  dismissHint,
  firstOpenHint,
  useHints,
  type HintIcon,
  type HintId,
} from '@/lib/hints';
import { colors, radius, spacing } from '@/theme';

/**
 * Подсказка на шаге: маленькая карточка в потоке экрана (не всплывающее окно
 * и не затемнение), «Понятно» или ✕ прячут её навсегда. Из списка `ids`
 * показывается первая незакрытая — на экране не больше одной подсказки.
 * `hidden` — экран сейчас показывает другую подсказку (например, форму цены).
 */
export function Hint({
  ids,
  hidden = false,
  style,
}: {
  ids: HintId | readonly HintId[];
  hidden?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { loaded, dismissed } = useHints();
  if (hidden || !loaded) return null;
  const id = firstOpenHint(typeof ids === 'string' ? [ids] : ids, dismissed);
  if (!id) return null;
  const hint = HINTS[id];
  return (
    <HintCard
      icon={hint.icon}
      text={hint.text}
      onClose={() => void dismissHint(id)}
      style={style}
    />
  );
}

/** Вид подсказки; `success` — зелёная «Готово!» после действия. */
export function HintCard({
  icon,
  text,
  onClose,
  tone = 'tip',
  style,
}: {
  icon: HintIcon | 'checkmark-circle-outline';
  text: string;
  onClose: () => void;
  tone?: 'tip' | 'success';
  style?: StyleProp<ViewStyle>;
}) {
  const success = tone === 'success';
  const accent = success ? colors.success : colors.primaryDark;
  return (
    <View style={[styles.card, success && styles.cardSuccess, style]}>
      <Ionicons name={icon} size={20} color={accent} style={styles.icon} />
      <View style={styles.body}>
        <Text style={styles.text}>{text}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Понятно, больше не показывать"
          onPress={onClose}
          hitSlop={8}
          style={({ pressed }) => [styles.ok, pressed && styles.pressed]}
        >
          <Text style={[styles.okText, { color: accent }]}>Понятно</Text>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Скрыть подсказку"
        onPress={onClose}
        hitSlop={10}
        style={({ pressed }) => [styles.close, pressed && styles.pressed]}
      >
        <Ionicons name="close" size={18} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryLight,
  },
  cardSuccess: { backgroundColor: colors.successLight, borderColor: colors.successLight },
  icon: { marginTop: 1 },
  body: { flex: 1, gap: spacing.xs },
  text: { fontSize: 14, lineHeight: 19, color: colors.text },
  ok: { alignSelf: 'flex-start', paddingVertical: 2 },
  okText: { fontSize: 14, fontWeight: '700' },
  close: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
});
