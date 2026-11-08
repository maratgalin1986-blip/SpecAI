import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { Activity } from '@/lib/api';
import { ACTIVITY_NOTE, customerStripText } from '@/lib/activity';
import { colors, radius, shadow, spacing } from '@/theme';

/**
 * Полоска «Сегодня: 14 заявок · 3 машины на линии рядом» поверх карты
 * заказчика; нажатие раскрывает последние события площадки (GET
 * /api/activity) — без имён, телефонов и адресов.
 */
export function ActivityStrip({
  activity,
  nearOnline,
  style,
}: {
  activity: Activity | null;
  nearOnline: number | null;
  style?: StyleProp<ViewStyle>;
}) {
  const [open, setOpen] = useState(false);
  if (!activity) return null;
  const line = customerStripText(activity.today, nearOnline);
  return (
    <View style={style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${line}. ${open ? 'Скрыть события' : 'Показать события площадки'}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={({ pressed }) => [styles.strip, pressed && styles.pressed]}
      >
        <View style={styles.dot} />
        <Text style={styles.stripText} numberOfLines={1}>
          {line}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
      </Pressable>
      {open ? (
        <View style={styles.panel}>
          {activity.events.length > 0 ? (
            activity.events.map((event) => (
              <Text key={`${event.kind}-${event.at}-${event.text}`} style={styles.event}>
                {event.text}
                <Text style={styles.ago}> · {event.ago}</Text>
              </Text>
            ))
          ) : (
            <Text style={styles.event}>За последние дни событий нет.</Text>
          )}
          <Text style={styles.note}>{ACTIVITY_NOTE}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.85 },
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    ...shadow.card,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  stripText: { flexShrink: 1, fontSize: 13, fontWeight: '700', color: colors.text },
  panel: {
    marginTop: spacing.xs,
    padding: spacing.md,
    gap: spacing.xs,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    ...shadow.card,
  },
  event: { fontSize: 13, lineHeight: 18, color: colors.text },
  ago: { color: colors.textMuted },
  note: { marginTop: spacing.xs, fontSize: 11, lineHeight: 15, color: colors.textMuted },
});
