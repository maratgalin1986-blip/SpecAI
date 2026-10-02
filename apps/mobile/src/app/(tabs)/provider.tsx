import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MyMapPinCard } from '@/components/MyMapPinCard';
import { NextStepCard } from '@/components/NextStepCard';
import { Button, EmptyState, ErrorBanner, Loader } from '@/components/ui';
import {
  ApiError,
  fetchMyEquipment,
  fetchProviderBookings,
  imageUri,
  updateEquipment,
  type Equipment,
  type EquipmentStatus,
} from '@/lib/api';
import { EQUIPMENT_STATUS_OPTIONS, formatMoney, pluralizeRu } from '@/lib/format';
import { colors, radius, shadow, spacing, TAP } from '@/theme';

function EquipmentRow({
  item,
  onStatusChanged,
}: {
  item: Equipment;
  onStatusChanged: (id: string, status: EquipmentStatus) => void;
}) {
  const image = imageUri(item.photoUrl ?? item.imageUrls[0]);
  const [saving, setSaving] = useState<EquipmentStatus | null>(null);
  const retired = item.status === 'RETIRED';

  const changeStatus = async (status: EquipmentStatus) => {
    if (status === item.status) return;
    setSaving(status);
    try {
      await updateEquipment(item.id, { status });
      onStatusChanged(item.id, status);
    } catch (caught) {
      Alert.alert(
        'Ошибка',
        caught instanceof ApiError ? caught.message : 'Не удалось изменить статус',
      );
    } finally {
      setSaving(null);
    }
  };

  return (
    <View style={[styles.equipmentCard, retired && styles.retired]}>
      <Link href={{ pathname: '/equipment/[id]', params: { id: item.id } }} asChild>
        <Pressable style={({ pressed }) => [styles.equipmentRow, pressed && styles.pressed]}>
          {image ? (
            <Image source={{ uri: image }} style={styles.thumb} resizeMode="cover" />
          ) : (
            <View style={[styles.thumb, styles.thumbPlaceholder]}>
              <Text style={styles.thumbText}>Нет фото</Text>
            </View>
          )}
          <View style={styles.equipmentBody}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {item.name}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {item.category.name}
            </Text>
            <Text style={styles.price}>
              {item.hourlyRate ? `${formatMoney(item.hourlyRate, item.currency)}/ч · ` : ''}
              {formatMoney(item.dailyRate, item.currency)}
              <Text style={styles.priceUnit}>/смена</Text>
            </Text>
          </View>
        </Pressable>
      </Link>
      <View style={styles.statusChips}>
        {EQUIPMENT_STATUS_OPTIONS.map((option) => {
          const active = option.value === item.status;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected: active, busy: saving === option.value }}
              disabled={saving !== null}
              onPress={() => void changeStatus(option.value)}
              accessibilityLabel={`${item.name}: ${option.label}`}
              style={[styles.statusChip, active && styles.statusChipActive]}
            >
              <Text style={[styles.statusChipText, active && styles.statusChipTextActive]}>
                {saving === option.value ? '…' : option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Link href={{ pathname: '/provider/equipment/edit/[id]', params: { id: item.id } }} asChild>
        <Button title="Изменить" variant="secondary" />
      </Link>
    </View>
  );
}

/**
 * «Техника» исполнителя: машины компании со статусом (Свободна / Занята /
 * На ремонте — PATCH /api/equipment/[id]), база на карте и добавление техники.
 * Брони переехали во вкладку «Мои заказы»; здесь — напоминание о неподтверждённых.
 */
export default function ProviderFleetScreen() {
  const [equipment, setEquipment] = useState<Equipment[] | null>(null);
  const [waiting, setWaiting] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') setRefreshing(true);
    setError(null);
    try {
      const [equipmentResult, bookingsResult] = await Promise.allSettled([
        fetchMyEquipment(),
        fetchProviderBookings(),
      ]);
      if (bookingsResult.status === 'fulfilled') {
        setWaiting(bookingsResult.value.bookings.filter((b) => b.status === 'PENDING').length);
      }
      if (equipmentResult.status === 'rejected') throw equipmentResult.reason;
      setEquipment(equipmentResult.value.equipment);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось загрузить технику');
      setEquipment((prev) => prev ?? []);
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Обновляем при каждом возврате на вкладку (после добавления техники и т.п.).
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (equipment === null) {
    return <Loader />;
  }

  const header = (
    <View style={styles.header}>
      {waiting > 0 ? (
        <Link href="/(tabs)/jobs" asChild>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.waiting, pressed && styles.pressed]}
          >
            <Ionicons name="notifications" size={20} color={colors.onDark} />
            <Text style={styles.waitingText}>
              {pluralizeRu(waiting, ['бронь ждёт', 'брони ждут', 'броней ждут'])} подтверждения
            </Text>
            <Ionicons name="chevron-forward" size={18} color={colors.onDark} />
          </Pressable>
        </Link>
      ) : null}
      <NextStepCard />
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      <Link href="/provider/equipment/new" asChild>
        <Button title="Добавить технику" size="large" />
      </Link>
      <MyMapPinCard />
    </View>
  );

  return (
    <FlatList
      data={equipment}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <EquipmentRow
          item={item}
          onStatusChanged={(id, status) =>
            setEquipment((prev) =>
              (prev ?? []).map((row) => (row.id === id ? { ...row, status } : row)),
            )
          }
        />
      )}
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
      ListHeaderComponent={header}
      ListEmptyComponent={
        !error ? (
          <EmptyState
            title="Техники пока нет"
            description="Нажмите «Добавить технику», чтобы разместить первую машину."
          />
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, paddingBottom: spacing.xl, flexGrow: 1 },
  header: { gap: spacing.md, marginBottom: spacing.md },
  waiting: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: TAP,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.dark,
  },
  waitingText: { flex: 1, color: colors.onDark, fontSize: 15, fontWeight: '700' },
  equipmentCard: {
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...shadow.card,
  },
  retired: { opacity: 0.75 },
  equipmentRow: { flexDirection: 'row', gap: spacing.md },
  statusChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  statusChip: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusChipActive: { borderColor: colors.dark, backgroundColor: colors.dark },
  statusChipText: { fontSize: 13, color: colors.textMuted, fontWeight: '500' },
  statusChipTextActive: { color: colors.onDark, fontWeight: '700' },
  pressed: { opacity: 0.9 },
  thumb: { width: 84, height: 84, borderRadius: radius.md, backgroundColor: colors.border },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  thumbText: { color: colors.textSoft, fontSize: 12 },
  equipmentBody: { flex: 1, gap: spacing.xs },
  cardTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text },
  meta: { fontSize: 14, color: colors.textMuted },
  price: { fontSize: 16, fontWeight: '800', color: colors.text },
  priceUnit: { fontSize: 13, fontWeight: '400', color: colors.textMuted },
});
