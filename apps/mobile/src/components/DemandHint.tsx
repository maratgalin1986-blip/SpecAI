import React, { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { fetchDemand, type DemandSummary } from '@/lib/api';
import { customerDemandText } from '@/lib/providerFeed';
import { colors, radius, spacing } from '@/theme';

let cached: Promise<DemandSummary | null> | null = null;

function loadDemand() {
  cached ??= fetchDemand().catch(() => null);
  return cached;
}

/**
 * Индикатор спроса под выбранным видом техники у заказчика:
 * «Сейчас много свободных машин» или «Мало — укажите дату заранее».
 */
export function DemandHint({
  categoryId,
  categoryName,
}: {
  categoryId: string | null | undefined;
  categoryName?: string | null;
}) {
  const [demand, setDemand] = useState<DemandSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadDemand().then((data) => !cancelled && setDemand(data));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!categoryId || !demand) return null;
  const row = demand.categories.find((item) => item.categoryId === categoryId);
  const level = row?.level ?? null;
  const tone = level === 'high' ? styles.high : level === 'medium' ? styles.medium : styles.low;
  return (
    <Text style={[styles.hint, tone]} accessibilityRole="text" accessibilityLiveRegion="polite">
      {customerDemandText(level, categoryName ?? row?.name)}
    </Text>
  );
}

const styles = StyleSheet.create({
  hint: {
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  low: { backgroundColor: colors.successLight, color: colors.success },
  medium: { backgroundColor: colors.warningLight, color: colors.warningText },
  high: { backgroundColor: colors.dangerLight, color: colors.danger },
});
