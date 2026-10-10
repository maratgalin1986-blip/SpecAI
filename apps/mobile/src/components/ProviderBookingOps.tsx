import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { ShiftControls } from '@/components/ShiftControls';
import { Button } from '@/components/ui';
import {
  ApiError,
  assignOperator,
  fetchBookingShifts,
  openShift,
  type BookingStatus,
  type Operator,
  type Shift,
} from '@/lib/api';
import { dayKey } from '@/lib/shifts';
import { colors, radius, spacing, TAP } from '@/theme';

const POLL_MS = 30_000;

/**
 * Блок исполнителя на карточке брони («Мои заказы»): назначить машиниста,
 * открыть смену на сегодня, вести её статусы и подтвердить табель.
 */
export function ProviderBookingOps({
  bookingId,
  bookingStatus,
  operatorId,
  operators,
  onOperatorChanged,
}: {
  bookingId: string;
  bookingStatus: BookingStatus;
  operatorId: string | null | undefined;
  operators: Operator[];
  onOperatorChanged?: (operatorId: string | null) => void;
}) {
  const [shifts, setShifts] = useState<Shift[] | null>(null);
  const [opening, setOpening] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [open, setOpen] = useState(bookingStatus === 'ACTIVE');
  const [error, setError] = useState<string | null>(null);
  const active = bookingStatus === 'CONFIRMED' || bookingStatus === 'ACTIVE';
  const watchable = active || bookingStatus === 'COMPLETED';

  const load = useCallback(async () => {
    try {
      const result = await fetchBookingShifts(bookingId);
      setShifts(result.shifts);
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось загрузить смены');
      setShifts((prev) => prev ?? []);
    }
  }, [bookingId]);

  useEffect(() => {
    if (!watchable || !open) return undefined;
    void load();
    if (!active) return undefined;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load, watchable, open, active]);

  if (!watchable) return null;

  const current = operators.find((row) => row.id === operatorId);
  const replace = (next: Shift) =>
    setShifts((prev) => (prev ?? []).map((row) => (row.id === next.id ? next : row)));

  const chooseOperator = () => {
    const choices = operators.filter((row) => row.active);
    Alert.alert(
      'Машинист на бронь',
      choices.length === 0 ? 'Добавьте машинистов во вкладке «Техника».' : undefined,
      [
        ...choices.map((row) => ({
          text: row.id === operatorId ? `✓ ${row.name}` : row.name,
          onPress: () => void assign(row.id),
        })),
        ...(operatorId ? [{ text: 'Снять машиниста', onPress: () => void assign(null) }] : []),
        { text: 'Отмена', style: 'cancel' as const },
      ],
      { cancelable: true },
    );
  };

  const assign = async (next: string | null) => {
    setAssigning(true);
    try {
      await assignOperator(bookingId, next);
      onOperatorChanged?.(next);
      void load();
    } catch (caught) {
      Alert.alert('Ошибка', caught instanceof ApiError ? caught.message : 'Не удалось назначить');
    } finally {
      setAssigning(false);
    }
  };

  const openToday = async () => {
    setOpening(true);
    setError(null);
    try {
      const result = await openShift(bookingId);
      setShifts((prev) => [
        result.shift,
        ...(prev ?? []).filter((row) => row.id !== result.shift.id),
      ]);
      setOpen(true);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось открыть смену');
    } finally {
      setOpening(false);
    }
  };

  const today = dayKey(new Date());
  const hasToday = shifts?.some((shift) => shift.date === today) ?? false;

  return (
    <View style={styles.box}>
      {active ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назначить машиниста"
          disabled={assigning}
          onPress={chooseOperator}
          style={({ pressed }) => [styles.operatorRow, pressed && styles.pressed]}
        >
          <Text style={styles.operatorLabel}>Машинист</Text>
          <Text style={[styles.operatorValue, !current && styles.operatorEmpty]} numberOfLines={1}>
            {assigning ? '…' : (current?.name ?? 'Не назначен')}
          </Text>
        </Pressable>
      ) : current ? (
        <Text style={styles.muted}>Машинист: {current.name}</Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={styles.toggle}
      >
        <Text style={styles.toggleText}>
          {open
            ? 'Скрыть смены'
            : `Смены и табель${shifts && shifts.length > 0 ? ` · ${shifts.length}` : ''}`}
        </Text>
      </Pressable>
      {open ? (
        <View style={styles.shifts}>
          {shifts === null ? (
            <Text style={styles.muted}>Загружаем смены…</Text>
          ) : shifts.length === 0 ? (
            <Text style={styles.muted}>
              Смен ещё нет — машинист откроет смену в приложении, или откройте её сами.
            </Text>
          ) : (
            shifts.map((shift) => (
              <ShiftControls key={shift.id} shift={shift} role="provider" onChanged={replace} />
            ))
          )}
          {active && !hasToday ? (
            <Button
              title="Открыть смену на сегодня"
              variant="secondary"
              loading={opening}
              onPress={() => void openToday()}
            />
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.sm },
  pressed: { opacity: 0.85 },
  operatorRow: {
    minHeight: TAP,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  operatorLabel: { fontSize: 14, color: colors.textMuted },
  operatorValue: { flexShrink: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  operatorEmpty: { color: colors.primaryDark },
  toggle: { minHeight: 40, justifyContent: 'center' },
  toggleText: { fontSize: 14, fontWeight: '600', color: colors.primaryDark },
  shifts: { gap: spacing.sm },
  muted: { fontSize: 13, color: colors.textMuted },
  error: { fontSize: 13, color: colors.danger },
});
