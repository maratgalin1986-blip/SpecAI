import { useFocusEffect, useRouter, type Href } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fetchGuide, type Guide } from '@/lib/api';
import { colors, radius, spacing } from '@/lib/theme';

/**
 * «Следующий шаг» от помощника: что сделать сейчас, по данным с сервера
 * (GET /api/guide). Без сети карточка просто не показывается.
 */
export function NextStepCard() {
  const router = useRouter();
  const [guide, setGuide] = useState<Guide | null>(null);
  const [open, setOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      fetchGuide()
        .then((data) => !cancelled && setGuide(data))
        .catch(() => undefined);
      return () => {
        cancelled = true;
      };
    }, []),
  );

  if (!guide) return null;
  const { next, progress } = guide;
  const target = next.action?.app;

  return (
    <View style={styles.card} accessibilityLabel="Помощник: следующий шаг">
      <View style={styles.headerRow}>
        <Text style={styles.eyebrow}>Следующий шаг</Text>
        <Text style={styles.progress}>
          {progress.done}/{progress.total}
        </Text>
      </View>
      <View style={styles.bar}>
        <View
          style={[
            styles.barFill,
            { width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` },
          ]}
        />
      </View>
      <Text style={styles.title}>{next.title}</Text>
      <Text style={styles.hint}>{next.hint}</Text>
      <View style={styles.actions}>
        {target && next.action ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(target as Href)}
            style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.buttonText}>{next.action.label}</Text>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" onPress={() => setOpen((value) => !value)}>
          <Text style={styles.toggle}>{open ? 'Скрыть шаги' : 'Все шаги'}</Text>
        </Pressable>
      </View>
      {open
        ? guide.steps.map((step) => (
            <Text key={step.id} style={[styles.step, step.done && styles.stepDone]}>
              {step.done ? '✅' : step.id === next.id ? '👉' : '⬜'} {step.title}
            </Text>
          ))
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.primaryLight,
    borderColor: '#fcd34d',
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { fontSize: 12, fontWeight: '700', color: colors.primaryDark, letterSpacing: 0.5 },
  progress: { fontSize: 12, color: colors.primaryDark },
  bar: { height: 5, borderRadius: 3, backgroundColor: '#fde68a', overflow: 'hidden' },
  barFill: { height: 5, borderRadius: 3, backgroundColor: colors.primary },
  title: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: spacing.xs },
  hint: { fontSize: 14, color: colors.dark, lineHeight: 19 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xs,
    flexWrap: 'wrap',
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  toggle: { color: colors.primaryDark, fontWeight: '600', fontSize: 13 },
  step: { fontSize: 14, color: colors.text },
  stepDone: { color: colors.textMuted, textDecorationLine: 'line-through' },
});
