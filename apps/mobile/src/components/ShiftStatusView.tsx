import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ShiftPhotos, ShiftTimeline } from '@/components/ShiftControls';
import { TimesheetCard } from '@/components/TimesheetCard';
import { Badge } from '@/components/ui';
import { ApiError, fetchBookingShifts, type BookingStatus, type Shift } from '@/lib/api';
import { formatMinutes, shiftTone, shortDay } from '@/lib/shifts';
import { colors, radius, spacing } from '@/theme';

/** Заказчик видит ход смены почти сразу: опрос раз в 30 секунд. */
const POLL_MS = 30_000;

const WATCHABLE: BookingStatus[] = ['CONFIRMED', 'ACTIVE', 'COMPLETED'];

/**
 * Статус смены машиниста на карточке брони заказчика: текущий статус,
 * отметки времени, фото, табель с кнопками «Подтвердить часы / Есть
 * замечания». Обновляется сам каждые 30 секунд.
 */
export function ShiftStatusView({
  bookingId,
  bookingStatus,
}: {
  bookingId: string;
  bookingStatus: BookingStatus;
}) {
  const [shifts, setShifts] = useState<Shift[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchable = WATCHABLE.includes(bookingStatus);

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
    if (!watchable) return undefined;
    void load();
    // Завершённую бронь читаем один раз, без опроса.
    if (bookingStatus === 'COMPLETED') return undefined;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load, watchable, bookingStatus]);

  if (!watchable) return null;
  if (shifts === null) return null;
  if (shifts.length === 0) {
    return (
      <Text style={styles.hint}>
        {error ?? 'Статусы машиниста появятся здесь, когда он выедет на объект.'}
      </Text>
    );
  }

  const replace = (next: Shift) =>
    setShifts((prev) => (prev ?? []).map((row) => (row.id === next.id ? next : row)));

  return (
    <View style={styles.list}>
      {shifts.map((shift) => (
        <View key={shift.id} style={styles.shift}>
          <View style={styles.header}>
            <Text style={styles.title}>
              Смена {shortDay(shift.date)}
              {shift.operator ? ` · ${shift.operator.name}` : ''}
            </Text>
            <Badge text={shift.statusLabel} tone={shiftTone(shift.status)} />
          </View>
          <Text style={styles.meta}>
            Работа: {formatMinutes(shift.workedMinutes)} · Простой:{' '}
            {formatMinutes(shift.idleMinutes)}
          </Text>
          <ShiftTimeline shift={shift} />
          <ShiftPhotos shift={shift} />
          <TimesheetCard shift={shift} role="customer" onChanged={replace} />
        </View>
      ))}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  shift: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted },
  hint: { fontSize: 13, color: colors.textMuted },
  error: { fontSize: 13, color: colors.danger },
});
