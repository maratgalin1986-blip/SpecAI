import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Badge, Button, Input } from '@/components/ui';
import { ApiError, reviewTimesheet, submitTimesheet, type Shift, type ShiftRole } from '@/lib/api';
import { TIMESHEET_STATE_LABELS, TIMESHEET_STATE_TONES, suggestedHours } from '@/lib/shifts';
import { colors, radius, spacing } from '@/theme';

/**
 * Табель смены. Машинист или исполнитель заполняет его после «Смена
 * завершена» (часы, простой, примечание); заказчик подтверждает или
 * оставляет замечание; администратор компании подтверждает. Табель
 * окончателен, когда подтвердили обе стороны.
 */

function parseHours(value: string): number | null {
  const parsed = Number(value.replace(',', '.'));
  if (!value.trim() || !Number.isFinite(parsed) || parsed < 0 || parsed > 24) return null;
  return parsed;
}

function TimesheetForm({
  shift,
  onSaved,
  onCancel,
}: {
  shift: Shift;
  onSaved: (shift: Shift) => void;
  onCancel?: () => void;
}) {
  const [hours, setHours] = useState(
    String(shift.timesheet?.hoursWorked ?? suggestedHours(shift.workedMinutes) ?? 8),
  );
  const [idle, setIdle] = useState(
    String(shift.timesheet?.idleHours ?? suggestedHours(shift.idleMinutes)),
  );
  const [note, setNote] = useState(shift.timesheet?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const hoursWorked = parseHours(hours);
    const idleHours = parseHours(idle || '0');
    if (hoursWorked === null || idleHours === null) {
      setError('Часы — число от 0 до 24');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await submitTimesheet({
        shiftId: shift.id,
        hoursWorked,
        idleHours,
        note: note.trim() || undefined,
      });
      onSaved(result.shift);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось сохранить табель');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.box}>
      <Text style={styles.title}>Табель смены</Text>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Input
            label="Отработано, ч"
            value={hours}
            onChangeText={setHours}
            keyboardType="decimal-pad"
            placeholder="8"
          />
        </View>
        <View style={styles.flex}>
          <Input
            label="Простой, ч"
            value={idle}
            onChangeText={setIdle}
            keyboardType="decimal-pad"
            placeholder="0"
          />
        </View>
      </View>
      <Input
        label="Примечание"
        value={note}
        onChangeText={setNote}
        placeholder="Что делали, что мешало (необязательно)"
        maxLength={1000}
        multiline
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title="Отправить заказчику" loading={saving} onPress={() => void submit()} />
      {onCancel ? <Button title="Отмена" variant="ghost" onPress={onCancel} /> : null}
    </View>
  );
}

export function TimesheetCard({
  shift,
  role,
  onChanged,
}: {
  shift: Shift;
  role: ShiftRole;
  onChanged: (shift: Shift) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState<'confirm' | 'dispute' | null>(null);
  const [disputing, setDisputing] = useState(false);
  const [disputeNote, setDisputeNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const timesheet = shift.timesheet;

  if (shift.status !== 'FINISHED') return null;

  const review = async (action: 'confirm' | 'dispute') => {
    if (!timesheet) return;
    if (action === 'dispute' && !disputeNote.trim()) {
      setError('Напишите, что не так с табелем');
      return;
    }
    setPending(action);
    setError(null);
    try {
      const result = await reviewTimesheet(timesheet.id, {
        action,
        note: action === 'dispute' ? disputeNote.trim() : undefined,
      });
      setDisputing(false);
      setDisputeNote('');
      onChanged(result.shift);
    } catch (caught) {
      Alert.alert('Ошибка', caught instanceof ApiError ? caught.message : 'Не удалось сохранить');
    } finally {
      setPending(null);
    }
  };

  if (!timesheet || editing) {
    if (role === 'customer') {
      return (
        <View style={styles.box}>
          <Text style={styles.muted}>
            Исполнитель заполняет табель смены — вы подтвердите часы.
          </Text>
        </View>
      );
    }
    return (
      <TimesheetForm
        shift={shift}
        onSaved={(next) => {
          setEditing(false);
          onChanged(next);
        }}
        onCancel={editing ? () => setEditing(false) : undefined}
      />
    );
  }

  const mine = role === 'customer' ? timesheet.customerConfirmedAt : timesheet.providerConfirmedAt;
  const canReview = role !== 'operator' && timesheet.state !== 'final' && !mine;
  const canResubmit = role !== 'customer' && timesheet.state === 'disputed';

  return (
    <View style={styles.box}>
      <View style={styles.header}>
        <Text style={styles.title}>
          Табель: {timesheet.hoursWorked} ч
          {Number(timesheet.idleHours) > 0 ? ` · простой ${timesheet.idleHours} ч` : ''}
        </Text>
        <Badge
          text={TIMESHEET_STATE_LABELS[timesheet.state]}
          tone={TIMESHEET_STATE_TONES[timesheet.state]}
        />
      </View>
      {timesheet.note ? <Text style={styles.muted}>{timesheet.note}</Text> : null}
      <Text style={styles.muted}>
        Заказчик: {timesheet.customerConfirmedAt ? 'подтвердил' : '—'} · Исполнитель:{' '}
        {timesheet.providerConfirmedAt ? 'подтвердил' : '—'}
      </Text>
      {timesheet.disputeNote ? (
        <Text style={styles.dispute}>Замечание: {timesheet.disputeNote}</Text>
      ) : null}
      {canReview ? (
        disputing ? (
          <>
            <Input
              label="Что не так"
              value={disputeNote}
              onChangeText={setDisputeNote}
              placeholder="Например: работали 6 часов, а не 8"
              maxLength={1000}
              multiline
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button
              title="Отправить замечание"
              variant="danger"
              loading={pending === 'dispute'}
              onPress={() => void review('dispute')}
            />
            <Button title="Отмена" variant="ghost" onPress={() => setDisputing(false)} />
          </>
        ) : (
          <View style={styles.actions}>
            <View style={styles.flex}>
              <Button
                title="Подтвердить часы"
                loading={pending === 'confirm'}
                disabled={pending !== null}
                onPress={() => void review('confirm')}
              />
            </View>
            <View style={styles.flex}>
              <Button
                title="Есть замечания"
                variant="secondary"
                disabled={pending !== null}
                onPress={() => setDisputing(true)}
              />
            </View>
          </View>
        )
      ) : null}
      {canResubmit ? (
        <Button title="Исправить табель" variant="secondary" onPress={() => setEditing(true)} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  box: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  title: { fontSize: 15, fontWeight: '700', color: colors.text, flexShrink: 1 },
  row: { flexDirection: 'row', gap: spacing.sm },
  muted: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  dispute: { fontSize: 13, color: colors.danger, fontWeight: '600' },
  error: { fontSize: 13, color: colors.danger },
  actions: { flexDirection: 'row', gap: spacing.sm },
});
