import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AdminGate } from '@/components/AdminGate';
import { Card, ErrorBanner, Loader } from '@/components/ui';
import { fetchAdminStats, type SignupCounts } from '@/lib/adminApi';
import { formatCount, signupLine, summaryRows, updatedLabel } from '@/lib/adminFormat';
import { useAdminData } from '@/lib/useAdminData';
import { colors, spacing, typography } from '@/theme';

export default function AdminStatsScreen() {
  return (
    <AdminGate>
      <AdminStats />
    </AdminGate>
  );
}

function Counter({ title, counts }: { title: string; counts: SignupCounts }) {
  return (
    <Card
      style={styles.counter}
      accessible
      accessibilityLabel={`${title}: ${counts.total}. ${signupLine(counts)}`}
    >
      <Text style={styles.counterTitle}>{title}</Text>
      <Text style={styles.counterValue} numberOfLines={1} adjustsFontSizeToFit>
        {formatCount(counts.total)}
      </Text>
      <Text style={styles.counterLine}>{signupLine(counts)}</Text>
    </Card>
  );
}

function AdminStats() {
  const { data: stats, error, loading, refreshing, refresh } = useAdminData(fetchAdminStats);

  if (loading && !stats) return <Loader />;

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
    >
      {error ? <ErrorBanner message={error} onRetry={() => void refresh()} /> : null}
      {stats ? (
        <>
          <Counter title="Заказчики" counts={stats.customers} />
          <Counter title="Исполнители" counts={stats.providers} />
          <Card style={styles.list}>
            {summaryRows(stats).map((row, index) => (
              <View key={row.label} style={[styles.row, index > 0 && styles.rowBorder]}>
                <Text style={styles.rowLabel}>{row.label}</Text>
                <Text style={styles.rowValue}>{row.value}</Text>
              </View>
            ))}
          </Card>
          <Text style={styles.footer}>
            {updatedLabel(stats.generatedAt)}. Служебные учётные записи заявок из чатов не
            считаются. Потяните вниз, чтобы обновить.
          </Text>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  counter: { gap: spacing.xs },
  counterTitle: { ...typography.caption, color: colors.textMuted, textTransform: 'uppercase' },
  counterValue: { fontSize: 44, lineHeight: 52, fontWeight: '800', color: colors.text },
  counterLine: { ...typography.small, color: colors.textMuted },
  list: { paddingVertical: 0, paddingHorizontal: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    minHeight: 48,
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  rowLabel: { ...typography.body, color: colors.text, flexShrink: 1 },
  rowValue: { ...typography.bodyStrong, color: colors.text },
  footer: { ...typography.small, color: colors.textSoft, textAlign: 'center' },
});
