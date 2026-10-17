import React, { useEffect, useReducer } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { AdminGate } from '@/components/AdminGate';
import { Badge, Button, Card, EmptyState, ErrorBanner, Loader } from '@/components/ui';
import {
  fetchModeration,
  moderateComment,
  moderateReview,
  type ModerationDecision,
} from '@/lib/adminApi';
import { moscowDateTime, starsText } from '@/lib/adminFormat';
import {
  emptyList,
  moderationRoute,
  optimisticReducer,
  toModerationItems,
  type ModerationItem,
} from '@/lib/adminModeration';
import { ApiError } from '@/lib/api';
import { useAdminData } from '@/lib/useAdminData';
import { colors, spacing, typography } from '@/theme';

export default function AdminModerationScreen() {
  return (
    <AdminGate>
      <AdminModeration />
    </AdminGate>
  );
}

const reducer = optimisticReducer<ModerationItem>;

function AdminModeration() {
  const { data, error, loading, refreshing, refresh } = useAdminData(fetchModeration);
  const [state, dispatch] = useReducer(reducer, undefined, emptyList<ModerationItem>);

  useEffect(() => {
    if (data) dispatch({ type: 'load', items: toModerationItems(data) });
  }, [data]);

  const decide = async (item: ModerationItem, status: ModerationDecision) => {
    dispatch({ type: 'remove', key: item.key });
    try {
      if (item.kind === 'review') await moderateReview(item.id, status);
      else await moderateComment(item.id, status);
      dispatch({ type: 'confirm', key: item.key });
    } catch (caught) {
      dispatch({
        type: 'restore',
        key: item.key,
        error: caught instanceof ApiError ? caught.message : 'Не удалось сохранить решение',
      });
    }
  };

  if (loading && !data) return <Loader />;

  return (
    <FlatList
      data={state.items}
      keyExtractor={(item) => item.key}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
      ListHeaderComponent={
        <View style={styles.header}>
          {error ? <ErrorBanner message={error} onRetry={() => void refresh()} /> : null}
          <Text style={styles.intro}>
            Отзыв (звёзды и текст) и комментарий видны людям и входят в рейтинг только после
            «Опубликовать». Телефоны и ссылки в тексте скрываются автоматически.
          </Text>
          {state.items.length > 0 ? (
            <Text style={styles.count}>Ждут решения: {state.items.length}</Text>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        data ? (
          <EmptyState
            title="Всё проверено"
            description="Новые отзывы и комментарии появятся здесь."
          />
        ) : null
      }
      renderItem={({ item }) => (
        <ModerationCard
          item={item}
          error={state.errors[item.key]}
          onApprove={() => void decide(item, 'APPROVED')}
          onReject={() => void decide(item, 'REJECTED')}
        />
      )}
    />
  );
}

function ModerationCard({
  item,
  error,
  onApprove,
  onReject,
}: {
  item: ModerationItem;
  error?: string;
  onApprove: () => void;
  onReject: () => void;
}) {
  const isReview = item.kind === 'review';
  const text = isReview ? item.comment?.trim() : item.text;
  return (
    <Card style={styles.card}>
      <View style={styles.cardTop}>
        <Badge text={isReview ? 'Отзыв' : 'Комментарий'} tone={isReview ? 'accent' : 'info'} />
        <Text style={styles.date}>{moscowDateTime(item.createdAt)}</Text>
      </View>
      {isReview ? (
        <Text style={styles.stars} accessibilityLabel={`Оценка ${item.rating} из 5`}>
          {starsText(item.rating)} <Text style={styles.starsNote}>{item.rating} из 5</Text>
        </Text>
      ) : null}
      {text ? (
        <Text style={styles.text}>{text}</Text>
      ) : (
        <Text style={styles.onlyRating}>Только оценка</Text>
      )}
      <Text style={styles.route}>{moderationRoute(item)}</Text>
      {item.author.email ? <Text style={styles.email}>{item.author.email}</Text> : null}
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Button title="Опубликовать" onPress={onApprove} style={styles.action} />
        <Button title="Скрыть" variant="secondary" onPress={onReject} style={styles.action} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  header: { gap: spacing.sm },
  intro: { ...typography.small, color: colors.textMuted },
  count: { ...typography.bodyStrong, color: colors.text },
  card: { gap: spacing.sm },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  date: { ...typography.small, color: colors.textSoft },
  stars: { fontSize: 22, color: colors.accent, letterSpacing: 1 },
  starsNote: { fontSize: 14, color: colors.textMuted, letterSpacing: 0 },
  text: { ...typography.body, color: colors.text },
  onlyRating: { ...typography.body, color: colors.textMuted, fontStyle: 'italic' },
  route: { ...typography.bodyStrong, color: colors.text },
  email: { ...typography.small, color: colors.textMuted },
  error: { ...typography.small, color: colors.danger },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  action: { flex: 1, paddingHorizontal: spacing.sm },
});
