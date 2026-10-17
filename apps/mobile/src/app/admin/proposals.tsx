import React, { useCallback, useEffect, useReducer, useState } from 'react';
import { FlatList, Linking, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { AdminGate } from '@/components/AdminGate';
import { Badge, Button, Card, EmptyState, ErrorBanner, Loader, Segmented } from '@/components/ui';
import { fetchProposals, setProposalStatus, type AdminProposal } from '@/lib/adminApi';
import { moscowDateTime } from '@/lib/adminFormat';
import { emptyList, optimisticReducer } from '@/lib/adminModeration';
import { ApiError } from '@/lib/api';
import { proposalContactUrl, proposalKindBadge } from '@/lib/proposals';
import { useAdminData } from '@/lib/useAdminData';
import { colors, spacing, TAP, typography } from '@/theme';

type Tab = 'NEW' | 'READ';
type Item = AdminProposal & { key: string };

const TABS = [
  { value: 'NEW', label: 'Новые' },
  { value: 'READ', label: 'Прочитанные' },
] as const;

export default function AdminProposalsScreen() {
  return (
    <AdminGate>
      <AdminProposals />
    </AdminGate>
  );
}

function AdminProposals() {
  const [tab, setTab] = useState<Tab>('NEW');
  return (
    <View style={styles.flex}>
      <View style={styles.tabs}>
        <Segmented options={TABS} value={tab} onChange={setTab} />
      </View>
      {/* Свой список на каждую вкладку: прочитанное в «Новых» появляется в «Прочитанных». */}
      <ProposalList key={tab} status={tab} />
    </View>
  );
}

const reducer = optimisticReducer<Item>;

function ProposalList({ status }: { status: Tab }) {
  const load = useCallback(() => fetchProposals(status), [status]);
  const { data, error, loading, refreshing, refresh } = useAdminData(load);
  const [state, dispatch] = useReducer(reducer, undefined, emptyList<Item>);

  useEffect(() => {
    if (data) dispatch({ type: 'load', items: data.map((item) => ({ ...item, key: item.id })) });
  }, [data]);

  const decide = async (item: Item, next: 'READ' | 'ARCHIVED') => {
    dispatch({ type: 'remove', key: item.key });
    try {
      await setProposalStatus(item.id, next);
      dispatch({ type: 'confirm', key: item.key });
    } catch (caught) {
      // Уже решено на сайте (409) или удалено (404): здесь решать нечего.
      if (caught instanceof ApiError && (caught.status === 409 || caught.status === 404)) {
        dispatch({ type: 'confirm', key: item.key });
        return;
      }
      dispatch({
        type: 'restore',
        key: item.key,
        error: caught instanceof ApiError ? caught.message : 'Не удалось сохранить',
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
            Идеи по сервису и предложения о сотрудничестве с сайта и из приложения. Ответьте по
            контакту, затем отметьте «Прочитано» или уберите в архив.
          </Text>
        </View>
      }
      ListEmptyComponent={
        data ? (
          <EmptyState
            title={status === 'NEW' ? 'Новых сообщений нет' : 'Прочитанных нет'}
            description="Новые предложения появятся здесь, придёт и сообщение в Telegram."
          />
        ) : null
      }
      renderItem={({ item }) => (
        <ProposalCard
          item={item}
          error={state.errors[item.key]}
          onRead={status === 'NEW' ? () => void decide(item, 'READ') : undefined}
          onArchive={() => void decide(item, 'ARCHIVED')}
        />
      )}
    />
  );
}

function ProposalCard({
  item,
  error,
  onRead,
  onArchive,
}: {
  item: Item;
  error?: string;
  onRead?: () => void;
  onArchive: () => void;
}) {
  const url = proposalContactUrl(item.contact);
  return (
    <Card style={styles.card}>
      <View style={styles.cardTop}>
        <Badge
          text={proposalKindBadge(item.kind)}
          tone={item.kind === 'PARTNERSHIP' ? 'info' : 'accent'}
        />
        <Text style={styles.date}>{moscowDateTime(item.createdAt)}</Text>
      </View>
      <Text style={styles.name}>
        {item.name}
        {item.company ? <Text style={styles.company}> · {item.company}</Text> : null}
      </Text>
      {url ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Ответить: ${item.contact}`}
          onPress={() => void Linking.openURL(url)}
          style={({ pressed }) => [styles.contactRow, pressed && styles.pressed]}
        >
          <Text style={styles.contactLink}>{item.contact}</Text>
        </Pressable>
      ) : (
        <Text style={styles.contact}>{item.contact}</Text>
      )}
      <Text style={styles.text}>{item.message}</Text>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <View style={styles.actions}>
        {onRead ? <Button title="Прочитано" onPress={onRead} style={styles.action} /> : null}
        <Button title="В архив" variant="secondary" onPress={onArchive} style={styles.action} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tabs: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
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
  date: { ...typography.small, color: colors.textSoft },
  name: { ...typography.bodyStrong, color: colors.text },
  company: { ...typography.body, color: colors.textMuted },
  contact: { ...typography.body, color: colors.text },
  pressed: { opacity: 0.8 },
  contactRow: { minHeight: TAP, justifyContent: 'center', alignSelf: 'flex-start' },
  contactLink: {
    ...typography.bodyStrong,
    color: colors.primaryDark,
    textDecorationLine: 'underline',
  },
  text: { ...typography.body, color: colors.text },
  error: { ...typography.small, color: colors.danger },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  action: { flex: 1, paddingHorizontal: spacing.sm },
});
