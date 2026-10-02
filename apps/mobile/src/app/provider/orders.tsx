import { Stack } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Badge, Button, Card, EmptyState, ErrorBanner, Input, Loader } from '@/components/ui';
import {
  ApiError,
  createBid,
  fetchMyEquipment,
  fetchOpenOrders,
  type Equipment,
  type Order,
} from '@/lib/api';
import { formatDate } from '@/lib/format';
import { colors, spacing } from '@/lib/theme';

function BidForm({
  order,
  equipment,
  onSubmitted,
  onCancel,
}: {
  order: Order;
  equipment: Equipment[];
  onSubmitted: (orderId: string) => void;
  onCancel: () => void;
}) {
  const [equipmentId, setEquipmentId] = useState(equipment[0]?.id ?? '');
  const [price, setPrice] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = equipment.find((item) => item.id === equipmentId);

  const handleSubmit = async () => {
    setError(null);
    if (!equipmentId) return setError('Выберите технику');
    const amount = Number(price.replace(',', '.'));
    if (!price.trim() || Number.isNaN(amount) || amount <= 0) {
      return setError('Укажите цену (число больше нуля)');
    }
    setSubmitting(true);
    try {
      await createBid(order.id, {
        equipmentId,
        price: amount,
        message: message.trim() || undefined,
      });
      Alert.alert('Предложение отправлено', 'Клиент получит уведомление на e-mail.');
      onSubmitted(order.id);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось отправить предложение');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.bidForm}>
      <Text style={styles.label}>Техника</Text>
      {equipment.length === 0 ? (
        <Text style={styles.hint}>
          У вас пока нет техники — добавьте её в кабинете, чтобы отправлять предложения.
        </Text>
      ) : (
        <View style={styles.chips}>
          {equipment.map((item) => {
            const active = item.id === equipmentId;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setEquipmentId(item.id)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                  {item.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
      <Input
        label={`Цена${selected ? ` (${selected.currency})` : ''}`}
        value={price}
        onChangeText={setPrice}
        placeholder={selected ? String(Number(selected.dailyRate)) : '0'}
        keyboardType="decimal-pad"
      />
      <Input
        label="Сообщение клиенту"
        value={message}
        onChangeText={setMessage}
        placeholder="Условия, доставка, оператор…"
        multiline
        numberOfLines={3}
        style={styles.textarea}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.bidActions}>
        <View style={styles.flex}>
          <Button title="Отмена" variant="secondary" onPress={onCancel} disabled={submitting} />
        </View>
        <View style={styles.flex}>
          <Button
            title="Отправить"
            loading={submitting}
            disabled={equipment.length === 0}
            onPress={() => void handleSubmit()}
          />
        </View>
      </View>
    </View>
  );
}

export default function ProviderOrdersScreen() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openBidFor, setOpenBidFor] = useState<string | null>(null);
  const [submittedIds, setSubmittedIds] = useState<Set<string>>(new Set());

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') setRefreshing(true);
    setError(null);
    try {
      const [ordersResult, equipmentResult] = await Promise.allSettled([
        fetchOpenOrders(),
        fetchMyEquipment(),
      ]);
      if (ordersResult.status === 'fulfilled') {
        setOrders(ordersResult.value.orders.filter((order) => order.status === 'OPEN'));
      }
      if (equipmentResult.status === 'fulfilled') setEquipment(equipmentResult.value.equipment);
      const failed = [ordersResult, equipmentResult].find((r) => r.status === 'rejected');
      if (failed) throw failed.reason;
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось загрузить заявки');
      setOrders((prev) => prev ?? []);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (orders === null) {
    return (
      <>
        <Stack.Screen options={{ title: 'Заявки клиентов' }} />
        <Loader />
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Заявки клиентов' }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const submitted = submittedIds.has(item.id);
            const isOpen = openBidFor === item.id;
            return (
              <Card style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle} numberOfLines={3}>
                    {item.description}
                  </Text>
                  {item.category ? <Badge text={item.category.name} tone="info" /> : null}
                </View>
                <Text style={styles.meta}>
                  {formatDate(item.desiredStartDate)} – {formatDate(item.desiredEndDate)}
                </Text>
                <Text style={styles.meta}>
                  {item.customer?.name ? `Клиент: ${item.customer.name} · ` : ''}
                  {/* bids — только свои; общее число приходит в bidCount. */}
                  Предложений: {(item as { bidCount?: number }).bidCount ?? item.bids.length}
                </Text>
                {submitted ? (
                  <Badge text="Предложение отправлено" tone="success" />
                ) : isOpen ? (
                  <BidForm
                    order={item}
                    equipment={equipment}
                    onCancel={() => setOpenBidFor(null)}
                    onSubmitted={(orderId) => {
                      setSubmittedIds((prev) => new Set(prev).add(orderId));
                      setOpenBidFor(null);
                    }}
                  />
                ) : (
                  <Button title="Предложить технику" onPress={() => setOpenBidFor(item.id)} />
                )}
              </Card>
            );
          }}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load('refresh')}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListHeaderComponent={
            error ? (
              <View style={styles.header}>
                <ErrorBanner message={error} onRetry={() => void load()} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            !error ? (
              <EmptyState
                title="Открытых заявок нет"
                description="Когда клиенты опубликуют заявки, они появятся здесь."
              />
            ) : null
          }
        />
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: spacing.lg, paddingBottom: spacing.xl * 2, flexGrow: 1 },
  header: { marginBottom: spacing.md },
  card: { gap: spacing.sm },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardTitle: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
  meta: { fontSize: 14, color: colors.textMuted },
  bidForm: {
    gap: spacing.md,
    marginTop: spacing.xs,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  label: { fontSize: 14, fontWeight: '500', color: colors.text },
  hint: { fontSize: 13, color: colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    maxWidth: '100%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  chipText: { fontSize: 14, color: colors.text },
  chipTextActive: { color: colors.primaryDark, fontWeight: '600' },
  textarea: { minHeight: 80, paddingTop: spacing.md, textAlignVertical: 'top' },
  error: { color: colors.danger, fontSize: 14 },
  bidActions: { flexDirection: 'row', gap: spacing.sm },
});
