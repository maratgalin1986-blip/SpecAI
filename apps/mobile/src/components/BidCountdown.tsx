import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { bidsLeftText, countdownTickMs } from '@/lib/providerFeed';
import { colors, radius, spacing } from '@/theme';

/**
 * «Предложить цену: осталось 1 ч 20 мин» — живой отсчёт на карточке заявки,
 * как на карточке входящего заказа у водителя. Обновляется раз в минуту,
 * в последние 10 минут — каждые 15 секунд; после срока пишет, что он вышел.
 */
export function BidCountdown({ bidsUntil }: { bidsUntil: string | null | undefined }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = countdownTickMs(bidsUntil, now);
    if (tick === null) return undefined;
    const timer = setTimeout(() => setNow(new Date()), tick);
    return () => clearTimeout(timer);
  }, [bidsUntil, now]);

  if (!bidsUntil) return null;
  const left = bidsLeftText(bidsUntil, now);
  const urgent = left !== null && new Date(bidsUntil).getTime() - now.getTime() <= 30 * 60_000;
  return (
    <View
      style={[styles.row, left === null ? styles.rowOver : urgent ? styles.rowUrgent : null]}
      accessibilityLiveRegion="polite"
    >
      <Ionicons
        name={left === null ? 'time' : 'timer-outline'}
        size={16}
        color={left === null ? colors.textMuted : urgent ? colors.danger : colors.primaryDark}
      />
      <Text
        style={[styles.text, left === null ? styles.textOver : urgent ? styles.textUrgent : null]}
      >
        {left === null ? 'Срок приёма предложений вышел' : `Предложить цену: ${left}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  rowUrgent: { backgroundColor: colors.dangerLight },
  rowOver: { backgroundColor: colors.surfaceMuted },
  text: { fontSize: 13, fontWeight: '700', color: colors.primaryDark },
  textUrgent: { color: colors.danger },
  textOver: { color: colors.textMuted },
});
