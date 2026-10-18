import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { DateField } from '@/components/DateField';
import { Button, Card, EmptyState, ErrorBanner, Loader } from '@/components/ui';
import {
  AVAILABILITY_LABELS,
  fetchAktualno,
  moscowDayKey,
  rowsFrom,
  saveAktualno,
  type AktualnoMachine,
  type AktualnoRow,
  type AvailabilityKind,
} from '@/lib/aktualno';
import { ApiError } from '@/lib/api';
import { colors, radius, spacing } from '@/lib/theme';

const KINDS: AvailabilityKind[] = ['today', 'tomorrow', 'busy'];

/** «Цены и свободные дни»: экран из еженедельного push и из кабинета исполнителя. */
export default function AktualnoScreen() {
  const [machines, setMachines] = useState<AktualnoMachine[] | null>(null);
  const [rows, setRows] = useState<AktualnoRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await fetchAktualno();
      setMachines(result.machines);
      setRows(rowsFrom(result.machines));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось загрузить технику');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const update = (id: string, patch: Partial<AktualnoRow>) =>
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const result = await saveAktualno(rows);
      setMessage({ ok: true, text: result.message });
    } catch (caught) {
      setMessage({
        ok: false,
        text: caught instanceof ApiError ? caught.message : 'Не удалось сохранить',
      });
    } finally {
      setSaving(false);
    }
  };

  if (error) return <ErrorBanner message={error} onRetry={() => void load()} />;
  if (!machines) return <Loader />;
  if (machines.length === 0) {
    return (
      <EmptyState
        title="Пока нет техники"
        description="Добавьте первую машину в кабинете исполнителя — и сможете обновлять её цену здесь."
      />
    );
  }

  const today = new Date();
  return (
    <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
      <Text style={styles.lead}>
        Проверьте цену и отметьте, когда машина свободна, — заказчики видят актуальную технику
        первой. Отметка «Свободна…» показывается в каталоге 7 дней.
      </Text>
      {machines.map((machine) => {
        const row = rows.find((item) => item.id === machine.id)!;
        return (
          <Card key={machine.id} style={styles.card}>
            <Text style={styles.title}>{machine.name}</Text>
            <Text style={styles.meta}>{machine.categoryName}</Text>
            <View style={styles.prices}>
              <View style={styles.priceField}>
                <Text style={styles.label}>Цена за час, ₽</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="number-pad"
                  value={row.hourly}
                  placeholder="—"
                  onChangeText={(hourly) => update(machine.id, { hourly })}
                />
              </View>
              <View style={styles.priceField}>
                <Text style={styles.label}>Смена 8 ч, ₽</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="number-pad"
                  value={row.daily}
                  onChangeText={(daily) => update(machine.id, { daily })}
                />
              </View>
            </View>
            <Text style={styles.label}>Когда свободна</Text>
            <View style={styles.chips}>
              {KINDS.map((kind) => (
                <Pressable
                  key={kind}
                  accessibilityRole="button"
                  accessibilityState={{ selected: row.kind === kind }}
                  onPress={() =>
                    update(machine.id, {
                      kind,
                      until: kind === 'busy' && !row.until ? moscowDayKey(today) : row.until,
                    })
                  }
                  style={[styles.chip, row.kind === kind && styles.chipActive]}
                >
                  <Text style={[styles.chipText, row.kind === kind && styles.chipTextActive]}>
                    {AVAILABILITY_LABELS[kind]}
                  </Text>
                </Pressable>
              ))}
            </View>
            {row.kind === 'busy' ? (
              <DateField
                label="Занята до (включительно)"
                value={row.until ? new Date(`${row.until}T12:00:00+03:00`) : today}
                minimumDate={today}
                onChange={(date) => update(machine.id, { until: moscowDayKey(date) })}
              />
            ) : null}
          </Card>
        );
      })}
      {message ? (
        <Text style={message.ok ? styles.ok : styles.error} accessibilityRole="alert">
          {message.text}
        </Text>
      ) : null}
      <Button title="Сохранить" size="large" loading={saving} onPress={() => void save()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.md, gap: spacing.md },
  lead: { fontSize: 15, color: colors.textMuted },
  card: { gap: spacing.sm },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted },
  prices: { flexDirection: 'row', gap: spacing.sm },
  priceField: { flex: 1, gap: spacing.xs },
  label: { fontSize: 13, color: colors.textMuted },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    minHeight: 44,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.card,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipText: { fontSize: 14, color: colors.text },
  chipTextActive: { color: colors.primaryDark, fontWeight: '600' },
  ok: { fontSize: 14, color: colors.success },
  error: { fontSize: 14, color: colors.danger },
});
