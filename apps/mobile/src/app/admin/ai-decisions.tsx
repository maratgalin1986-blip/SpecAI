import React from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { AdminGate } from '@/components/AdminGate';
import { Badge, Card, EmptyState, ErrorBanner, Loader, type BadgeTone } from '@/components/ui';
import { fetchAiDecisions, type AiDecision } from '@/lib/adminApi';
import { moscowDateTime } from '@/lib/adminFormat';
import { ORDER_STATUS_LABELS } from '@/lib/format';
import { useAdminData } from '@/lib/useAdminData';
import { colors, spacing, typography } from '@/theme';

const DECISIONS: Record<string, { text: string; tone: BadgeTone }> = {
  PUBLISH: { text: 'Опубликовал', tone: 'success' },
  REJECT: { text: 'Отклонил', tone: 'danger' },
  UNSURE: { text: 'Сомневается', tone: 'warning' },
};

/** Те же подписи, что у заявок на сайте (ORDER_STATUS_LABELS в @specai/shared). */
const STATUSES: Record<string, string> = {
  ...ORDER_STATUS_LABELS,
  PENDING_REVIEW: 'На модерации',
};

export default function AdminAiDecisionsScreen() {
  return (
    <AdminGate>
      <AiDecisions />
    </AdminGate>
  );
}

/** Только просмотр: исправить решение можно в админке на сайте. */
function AiDecisions() {
  const { data, error, loading, refreshing, refresh } = useAdminData(fetchAiDecisions);
  if (loading && !data) return <Loader />;
  return (
    <FlatList
      data={data?.decisions ?? []}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
      ListHeaderComponent={
        <View style={styles.header}>
          {error ? <ErrorBanner message={error} onRetry={() => void refresh()} /> : null}
          <Text style={styles.intro}>
            {data && !data.enabled
              ? 'ИИ-модератор выключен: на сервере не задан ключ. Сомнительные заявки ждут в «Заявках из чатов».'
              : 'Сомнительные заявки из чатов проверяет ИИ: публикует заказы техники, отклоняет рекламу, вакансии и спам. Исправить решение можно в полной админке на сайте.'}
          </Text>
        </View>
      }
      ListEmptyComponent={data ? <EmptyState title="Решений пока нет" /> : null}
      renderItem={({ item }) => <DecisionCard item={item} />}
    />
  );
}

function DecisionCard({ item }: { item: AiDecision }) {
  const decision = DECISIONS[item.decision] ?? { text: item.decision, tone: 'neutral' as const };
  return (
    <Card style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.badges}>
          <Badge text={decision.text} tone={decision.tone} />
          {item.overridden ? <Badge text="Изменено вручную" /> : null}
        </View>
        <Text style={styles.date}>{item.moderatedAt ? moscowDateTime(item.moderatedAt) : '—'}</Text>
      </View>
      {item.reason ? <Text style={styles.reason}>{item.reason}</Text> : null}
      <Text style={styles.text}>{item.excerpt}</Text>
      <Text style={styles.status}>Сейчас: {STATUSES[item.status] ?? item.status}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  header: { gap: spacing.sm },
  intro: { ...typography.small, color: colors.textMuted },
  card: { gap: spacing.sm },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, flexShrink: 1 },
  date: { ...typography.small, color: colors.textSoft },
  reason: { ...typography.bodyStrong, color: colors.text },
  text: { ...typography.body, color: colors.text },
  status: { ...typography.small, color: colors.textMuted },
});
