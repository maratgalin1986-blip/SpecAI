import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DateField } from '@/components/DateField';
import { Badge, Button, Card, ErrorBanner, Input, Loader } from '@/components/ui';
import {
  ApiError,
  createEquipmentBlock,
  deleteEquipmentBlock,
  fetchMachineCalendar,
  type CalendarDay,
  type CalendarDayKind,
  type MachineCalendar,
} from '@/lib/api';
import { BOOKING_STATUS_LABELS, formatMoney, toIsoDate } from '@/lib/format';
import {
  CALENDAR_KIND_LABELS,
  MONTH_NAMES,
  leadingBlanks,
  monthKey,
  shiftMonth,
  shortDay,
} from '@/lib/shifts';
import { colors, radius, spacing, TAP, typography } from '@/theme';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const KIND_STYLE: Record<CalendarDayKind, { bg: string; fg: string }> = {
  free: { bg: colors.card, fg: colors.text },
  booked: { bg: colors.dark, fg: colors.onDark },
  pending: { bg: colors.warningLight, fg: colors.warningText },
  blocked: { bg: colors.border, fg: colors.textMuted },
  maintenance: { bg: colors.infoLight, fg: colors.info },
};

function DayDetails({
  day,
  calendar,
  onFreed,
}: {
  day: CalendarDay;
  calendar: MachineCalendar;
  onFreed: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const booking = day.bookingId ? calendar.bookings.find((row) => row.id === day.bookingId) : null;
  const block = day.blockId ? calendar.blocks.find((row) => row.id === day.blockId) : null;

  const free = async () => {
    if (!block) return;
    setBusy(true);
    try {
      await deleteEquipmentBlock(calendar.equipment.id, block.id);
      onFreed();
    } catch (caught) {
      Alert.alert(
        'Ошибка',
        caught instanceof ApiError ? caught.message : 'Не удалось снять блокировку',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={styles.details}>
      <View style={styles.detailsHeader}>
        <Text style={styles.detailsTitle}>{shortDay(day.date)}</Text>
        <Badge
          text={CALENDAR_KIND_LABELS[day.kind]}
          tone={
            day.kind === 'booked'
              ? 'dark'
              : day.kind === 'pending'
                ? 'warning'
                : day.kind === 'free'
                  ? 'success'
                  : 'neutral'
          }
        />
      </View>
      {booking ? (
        <Text style={styles.detailsText}>
          Бронь {shortDay(booking.startDate)} – {shortDay(booking.endDate)} · {booking.customer} ·{' '}
          {formatMoney(booking.totalPrice, booking.currency)} ·{' '}
          {BOOKING_STATUS_LABELS[booking.status]}
          {booking.operator ? ` · машинист ${booking.operator.name}` : ''}
        </Text>
      ) : null}
      {block ? (
        <>
          <Text style={styles.detailsText}>
            Не сдаётся {shortDay(block.from)} – {shortDay(block.to)}
            {block.reason ? ` · ${block.reason}` : ''}
          </Text>
          <Button
            title="Снова сдавать"
            variant="secondary"
            loading={busy}
            onPress={() => void free()}
          />
        </>
      ) : null}
      {day.kind === 'maintenance' ? (
        <Text style={styles.detailsText}>
          Машина отмечена «На ремонте» — верните статус «Свободна», когда она готова.
        </Text>
      ) : null}
      {day.kind === 'free' ? (
        <Text style={styles.detailsText}>День свободен — заказчики могут забронировать.</Text>
      ) : null}
    </Card>
  );
}

function BlockForm({ equipmentId, onAdded }: { equipmentId: string; onAdded: () => void }) {
  const [from, setFrom] = useState(new Date());
  const [to, setTo] = useState(new Date());
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (to < from) {
      setError('Дата окончания не может быть раньше даты начала');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createEquipmentBlock(equipmentId, {
        from: toIsoDate(from),
        to: toIsoDate(to),
        reason: reason.trim() || undefined,
      });
      setReason('');
      onAdded();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось заблокировать дни');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={styles.form}>
      <Text style={styles.formTitle}>Не сдаётся</Text>
      <Text style={styles.formHint}>
        Заблокируйте дни, когда машина занята своими работами или на ТО, — заказчики их не увидят.
      </Text>
      <DateField
        label="С"
        value={from}
        onChange={(date) => {
          setFrom(date);
          if (date > to) setTo(date);
        }}
      />
      <DateField label="По" value={to} onChange={setTo} minimumDate={from} />
      <Input
        label="Причина"
        value={reason}
        onChangeText={setReason}
        placeholder="ТО, свой объект…"
        maxLength={200}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button
        title="Заблокировать дни"
        variant="dark"
        loading={busy}
        onPress={() => void submit()}
      />
    </Card>
  );
}

/**
 * Календарь занятости машины: занятые, ожидающие, заблокированные дни и
 * ремонт. Нажатие на день показывает бронь; дни «Не сдаётся» исполнитель
 * блокирует и освобождает сам.
 */
export default function MachineCalendarScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [period, setPeriod] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });
  const [calendar, setCalendar] = useState<MachineCalendar | null>(null);
  const [selected, setSelected] = useState<CalendarDay | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      setCalendar(await fetchMachineCalendar(id, monthKey(period.year, period.month)));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось загрузить календарь');
      setCalendar((prev) => prev);
    }
  }, [id, period]);

  useEffect(() => {
    setSelected(null);
    void load();
  }, [load]);

  if (!calendar && !error) return <Loader />;

  const blanks = leadingBlanks(period.year, period.month);
  const legend: CalendarDayKind[] = ['free', 'booked', 'pending', 'blocked', 'maintenance'];

  return (
    <>
      <Stack.Screen options={{ title: calendar?.equipment.name ?? 'Календарь' }} />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.monthRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Предыдущий месяц"
            onPress={() => setPeriod((prev) => shiftMonth(prev.year, prev.month, -1))}
            style={styles.monthButton}
          >
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <Text style={styles.monthTitle}>
            {MONTH_NAMES[period.month - 1]} {period.year}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Следующий месяц"
            onPress={() => setPeriod((prev) => shiftMonth(prev.year, prev.month, 1))}
            style={styles.monthButton}
          >
            <Ionicons name="chevron-forward" size={22} color={colors.text} />
          </Pressable>
        </View>
        {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
        {calendar ? (
          <>
            {calendar.nextFree ? (
              <Badge text={`Свободна с ${shortDay(calendar.nextFree)}`} tone="success" />
            ) : (
              <Badge text="Ближайших свободных дней нет" tone="neutral" />
            )}
            <View style={styles.grid}>
              {WEEKDAYS.map((day) => (
                <Text key={day} style={styles.weekday}>
                  {day}
                </Text>
              ))}
              {Array.from({ length: blanks }, (_, index) => (
                <View key={`pad-${index}`} style={styles.cell} />
              ))}
              {calendar.days.map((day) => {
                const style = KIND_STYLE[day.kind];
                const active = selected?.date === day.date;
                return (
                  <Pressable
                    key={day.date}
                    accessibilityRole="button"
                    accessibilityLabel={`${shortDay(day.date)}: ${CALENDAR_KIND_LABELS[day.kind]}`}
                    accessibilityState={{ selected: active }}
                    onPress={() => setSelected(day)}
                    style={[
                      styles.cell,
                      styles.day,
                      { backgroundColor: style.bg },
                      active && styles.daySelected,
                      day.past && styles.dayPast,
                    ]}
                  >
                    <Text style={[styles.dayText, { color: style.fg }]}>
                      {Number(day.date.slice(-2))}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.legend}>
              {legend.map((kind) => (
                <View key={kind} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: KIND_STYLE[kind].bg }]} />
                  <Text style={styles.legendText}>
                    {CALENDAR_KIND_LABELS[kind]}
                    {calendar.summary[kind] > 0 ? ` · ${calendar.summary[kind]}` : ''}
                  </Text>
                </View>
              ))}
            </View>
            {selected ? (
              <DayDetails
                day={selected}
                calendar={calendar}
                onFreed={() => {
                  setSelected(null);
                  void load();
                }}
              />
            ) : null}
            <BlockForm equipmentId={calendar.equipment.id} onAdded={() => void load()} />
          </>
        ) : null}
      </ScrollView>
    </>
  );
}

const CELL = `${100 / 7}%`;

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthButton: { width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center' },
  monthTitle: { ...typography.heading, color: colors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: {
    width: CELL,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    paddingVertical: spacing.xs,
  },
  cell: { width: CELL, aspectRatio: 1, padding: 2 },
  day: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  daySelected: { borderColor: colors.primary, borderWidth: 2 },
  dayPast: { opacity: 0.5 },
  dayText: { fontSize: 15, fontWeight: '700' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendDot: { width: 12, height: 12, borderRadius: 3, borderWidth: 1, borderColor: colors.border },
  legendText: { fontSize: 12, color: colors.textMuted },
  details: { gap: spacing.sm },
  detailsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  detailsTitle: { ...typography.bodyStrong, color: colors.text },
  detailsText: { fontSize: 14, lineHeight: 20, color: colors.text },
  form: { gap: spacing.sm },
  formTitle: { ...typography.heading, color: colors.text },
  formHint: { fontSize: 13, lineHeight: 18, color: colors.textMuted },
  error: { fontSize: 13, color: colors.danger },
});
