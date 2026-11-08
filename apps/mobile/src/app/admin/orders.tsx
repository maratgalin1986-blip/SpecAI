import React, { useEffect, useReducer } from 'react';
import {
  Alert,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AdminGate } from '@/components/AdminGate';
import { Button, Card, EmptyState, ErrorBanner, Loader } from '@/components/ui';
import { fetchChatOrders, moderateOrder, type ChatOrder } from '@/lib/adminApi';
import { moscowDate, moscowDateTime, sourceLabel } from '@/lib/adminFormat';
import { emptyList, optimisticReducer } from '@/lib/adminModeration';
import { ApiError } from '@/lib/api';
import { phoneToHref } from '@/lib/format';
import { useAdminData } from '@/lib/useAdminData';
import { colors, spacing, typography } from '@/theme';

export default function AdminOrdersScreen() {
  return (
    <AdminGate>
      <AdminOrders />
    </AdminGate>
  );
}

type OrderItem = ChatOrder & { key: string };
const reducer = optimisticReducer<OrderItem>;

function AdminOrders() {
  const { data, error, loading, refreshing, refresh } = useAdminData(fetchChatOrders);
  const [state, dispatch] = useReducer(reducer, undefined, emptyList<OrderItem>);

  useEffect(() => {
    if (data) dispatch({ type: 'load', items: data.map((order) => ({ ...order, key: order.id })) });
  }, [data]);

  const decide = async (order: OrderItem, status: 'OPEN' | 'CANCELLED') => {
    dispatch({ type: 'remove', key: order.key });
    try {
      await moderateOrder(order.id, status);
      dispatch({ type: 'confirm', key: order.key });
    } catch (caught) {
      // Уже решено на сайте (409) или удалено (404): здесь решать нечего.
      if (caught instanceof ApiError && (caught.status === 409 || caught.status === 404)) {
        dispatch({ type: 'confirm', key: order.key });
        return;
      }
      dispatch({
        type: 'restore',
        key: order.key,
        error: caught instanceof ApiError ? caught.message : 'Не удалось сохранить решение',
      });
    }
  };

  const reject = (order: OrderItem) => {
    Alert.alert('Отклонить заявку?', 'Исполнители её не увидят. Вернуть её будет нельзя.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Отклонить', style: 'destructive', onPress: () => void decide(order, 'CANCELLED') },
    ]);
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
            Заявки, найденные в чатах. После «Опубликовать» их видят исполнители и получают
            уведомление. Новые — сверху.
          </Text>
          {state.items.length > 0 ? (
            <Text style={styles.count}>Ждут решения: {state.items.length}</Text>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        data ? (
          <EmptyState title="Новых заявок из чатов нет" description="Они появятся здесь." />
        ) : null
      }
      renderItem={({ item }) => (
        <OrderCard
          order={item}
          error={state.errors[item.key]}
          onPublish={() => void decide(item, 'OPEN')}
          onReject={() => reject(item)}
        />
      )}
    />
  );
}

function OrderCard({
  order,
  error,
  onPublish,
  onReject,
}: {
  order: OrderItem;
  error?: string;
  onPublish: () => void;
  onReject: () => void;
}) {
  const meta = [
    sourceLabel(order.source),
    order.sourceChat,
    order.category?.name,
    order.location?.city,
    `на ${moscowDate(order.desiredStartDate)}`,
  ].filter(Boolean);
  const phone = order.contactPhone;
  return (
    <Card style={styles.card}>
      <Text style={styles.date}>Найдена {moscowDateTime(order.createdAt)}</Text>
      <Text style={styles.text}>{order.rawText?.trim() || order.description}</Text>
      <Text style={styles.meta}>{meta.join(' · ')}</Text>
      {order.contactName || phone ? (
        <View style={styles.contact}>
          {order.contactName ? <Text style={styles.contactName}>{order.contactName}</Text> : null}
          {phone ? (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`Позвонить ${phone}`}
              onPress={() => void Linking.openURL(phoneToHref(phone))}
              style={({ pressed }) => [styles.phoneWrap, pressed && styles.pressed]}
            >
              <Text style={styles.phone}>{phone}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Button title="Опубликовать" onPress={onPublish} style={styles.action} />
        <Button title="Отклонить" variant="danger" onPress={onReject} style={styles.action} />
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
  date: { ...typography.small, color: colors.textSoft },
  text: { ...typography.body, color: colors.text },
  meta: { ...typography.small, color: colors.textMuted },
  contact: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md },
  contactName: { ...typography.bodyStrong, color: colors.text },
  phoneWrap: { minHeight: 44, justifyContent: 'center' },
  phone: { ...typography.bodyStrong, color: colors.primaryDark },
  pressed: { opacity: 0.85 },
  error: { ...typography.small, color: colors.danger },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  action: { flex: 1, paddingHorizontal: spacing.sm },
});
