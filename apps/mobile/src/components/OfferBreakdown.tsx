import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Bid } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { offerParts } from '@/lib/providerFeed';
import { colors, radius, spacing } from '@/theme';

/** Разбивка цены предложения на карточке: подача, смены, итого. */
export function OfferBreakdown({ bid }: { bid: Bid }) {
  const parts = offerParts(bid);
  if (!parts && !bid.optionsNote) return null;
  return (
    <View style={styles.box}>
      {parts ? (
        <View style={styles.row}>
          <View style={styles.cell}>
            <Text style={styles.label}>Подача</Text>
            <Text style={styles.value}>
              {parts.delivery > 0 ? formatMoney(parts.delivery, bid.currency) : 'бесплатно'}
            </Text>
          </View>
          <View style={styles.cell}>
            <Text style={styles.label}>Смены</Text>
            <Text style={styles.value}>
              {parts.shifts} × {formatMoney(parts.shiftPrice, bid.currency)}
            </Text>
          </View>
          <View style={styles.cell}>
            <Text style={styles.label}>Итого</Text>
            <Text style={styles.value}>{formatMoney(parts.total, bid.currency)}</Text>
          </View>
        </View>
      ) : null}
      {bid.optionsNote ? <Text style={styles.options}>Опции: {bid.optionsNote}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  row: { flexDirection: 'row', gap: spacing.sm },
  cell: { flex: 1, gap: 2 },
  label: { fontSize: 11, color: colors.textMuted },
  value: { fontSize: 13, fontWeight: '700', color: colors.text },
  options: { fontSize: 12, color: colors.textMuted },
});
