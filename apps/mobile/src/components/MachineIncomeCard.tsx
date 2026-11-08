import { Link } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/ui';
import { ApiError, fetchMachineIncome, type MachineIncomeReport } from '@/lib/api';
import { formatMoney, pluralizeRu } from '@/lib/format';
import { MONTH_NAMES } from '@/lib/shifts';
import { colors, spacing, typography } from '@/theme';

/**
 * «Доход по технике» в кабинете исполнителя: за текущий месяц по каждой
 * машине и итог (GET /api/shifts/income). Где табель подтвердили обе
 * стороны — часы × цена часа вместо цены брони.
 */
export function MachineIncomeCard({ refreshKey }: { refreshKey?: unknown } = {}) {
  const [report, setReport] = useState<MachineIncomeReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    try {
      setReport(await fetchMachineIncome());
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось загрузить доход');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const month = report ? (MONTH_NAMES[Number(report.month.split('-')[1]) - 1] ?? '') : '';
  const rows = report?.machines ?? [];
  const shown = expanded ? rows : rows.slice(0, 3);

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text style={styles.title}>Доход по технике</Text>
          <Text style={styles.sub}>
            {month ? `${month} · ` : ''}по подтверждённым броням и табелям
          </Text>
        </View>
        <Text style={styles.total}>{report ? formatMoney(report.total) : '—'}</Text>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {report && rows.length === 0 ? (
        <Text style={styles.sub}>Добавьте технику — доход появится после первых броней.</Text>
      ) : null}
      {shown.map((row) => (
        <Link
          key={row.equipmentId}
          href={{ pathname: '/provider/equipment/calendar/[id]', params: { id: row.equipmentId } }}
          asChild
        >
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`${row.name}: ${formatMoney(row.income)}, открыть календарь`}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <View style={styles.flex}>
              <Text style={styles.name} numberOfLines={1}>
                {row.name}
              </Text>
              <Text style={styles.meta}>
                {row.bookings === 0
                  ? 'броней нет'
                  : `${pluralizeRu(row.bookings, ['бронь', 'брони', 'броней'])}${row.confirmedHours > 0 ? ` · по табелю ${row.confirmedHours} ч` : ''}`}
              </Text>
            </View>
            <Text style={styles.income}>{formatMoney(row.income)}</Text>
          </Pressable>
        </Link>
      ))}
      {rows.length > 3 ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setExpanded((value) => !value)}
          style={styles.more}
        >
          <Text style={styles.moreText}>{expanded ? 'Свернуть' : `Ещё ${rows.length - 3}`}</Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.85 },
  card: { gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { ...typography.heading, color: colors.text },
  sub: { fontSize: 13, color: colors.textMuted },
  total: { fontSize: 20, fontWeight: '800', color: colors.text },
  row: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  name: { fontSize: 15, fontWeight: '600', color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted },
  income: { fontSize: 15, fontWeight: '800', color: colors.text },
  more: { minHeight: 40, justifyContent: 'center' },
  moreText: { fontSize: 14, fontWeight: '600', color: colors.primaryDark },
  error: { fontSize: 13, color: colors.danger },
});
