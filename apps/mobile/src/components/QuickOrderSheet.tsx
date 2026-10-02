import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { DateField } from '@/components/DateField';
import { Button, Segmented } from '@/components/ui';
import { ApiError, createOrder, fetchCategories, type Category } from '@/lib/api';
import { addDays, pluralizeRu, startOfDay, toIsoDate } from '@/lib/format';
import { categoryIcon, quickOrderDescription } from '@/lib/orderFlow';
import { colors, radius, shadow, spacing, TAP, typography } from '@/theme';

type When = 'now' | 'date';

const WHEN_OPTIONS = [
  { value: 'now', label: 'Нужна сейчас' },
  { value: 'date', label: 'На дату' },
] as const;

/**
 * Нижняя шторка главного экрана заказчика: адрес, тип техники, «сейчас / на
 * дату» и большая кнопка «Заказать». Заказ в 1–3 касания: по умолчанию одна
 * смена сегодня; заявка уходит в ту же POST /api/orders, что и подробная форма.
 */
export function QuickOrderSheet({ bottomInset = 0 }: { bottomInset?: number }) {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const today = useMemo(() => startOfDay(new Date()), []);
  const [expanded, setExpanded] = useState(true);
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [when, setWhen] = useState<When>('now');
  const [date, setDate] = useState(() => addDays(today, 1));
  const [days, setDays] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchCategories()
      .then((data) => !cancelled && setCategories(data.categories))
      .catch(() => !cancelled && setCategories([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const category = categories?.find((item) => item.id === categoryId) ?? null;
  const start = when === 'now' ? today : date;

  const submit = async () => {
    Keyboard.dismiss();
    setError(null);
    if (!category && !note.trim()) {
      setError('Выберите технику или коротко опишите задачу');
      return;
    }
    setSubmitting(true);
    try {
      const { order } = await createOrder({
        description: quickOrderDescription({
          categoryName: category?.name,
          address,
          note,
          urgent: when === 'now',
          days,
        }),
        desiredStartDate: toIsoDate(start),
        desiredEndDate: toIsoDate(addDays(start, days - 1)),
        categoryId: category?.id,
        address: address.trim() || undefined,
      });
      setNote('');
      router.push({ pathname: '/orders/[id]', params: { id: order.id } });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось создать заказ');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.sheet, { paddingBottom: spacing.lg + bottomInset }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Свернуть панель заказа' : 'Развернуть панель заказа'}
        onPress={() => setExpanded((value) => !value)}
        style={styles.handleArea}
      >
        <View style={styles.handle} />
      </Pressable>

      {expanded ? (
        <ScrollView
          style={{ maxHeight: height * 0.5 }}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title} accessibilityRole="header">
            Какая техника нужна?
          </Text>

          <View style={styles.addressRow}>
            <Ionicons name="location" size={20} color={colors.primary} />
            <TextInput
              value={address}
              onChangeText={setAddress}
              placeholder="Куда подать технику: адрес объекта"
              placeholderTextColor={colors.textSoft}
              accessibilityLabel="Адрес объекта"
              style={styles.addressInput}
              maxLength={200}
              returnKeyType="done"
            />
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tiles}
            keyboardShouldPersistTaps="handled"
          >
            {categories === null ? (
              <Text style={styles.muted}>Загружаем виды техники…</Text>
            ) : (
              categories.map((item) => {
                const selected = item.id === categoryId;
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityLabel={item.name}
                    accessibilityState={{ selected }}
                    onPress={() => setCategoryId(selected ? null : item.id)}
                    style={({ pressed }) => [
                      styles.tile,
                      selected && styles.tileSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.tileIcon}>{categoryIcon(item.name)}</Text>
                    <Text
                      style={[styles.tileText, selected && styles.tileTextSelected]}
                      numberOfLines={2}
                    >
                      {item.name}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </ScrollView>

          <Segmented
            options={WHEN_OPTIONS}
            value={when}
            onChange={(next) => {
              setWhen(next);
              // «Нужна сейчас» — одна смена сегодня.
              if (next === 'now') setDays(1);
            }}
          />

          {when === 'date' ? (
            <View style={styles.dateRow}>
              <View style={styles.flex}>
                <DateField label="Дата" value={date} minimumDate={today} onChange={setDate} />
              </View>
            </View>
          ) : null}

          {when === 'date' ? (
            <View style={styles.daysRow}>
              <Text style={styles.daysLabel}>Срок</Text>
              <View style={styles.stepper}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Меньше дней"
                  disabled={days <= 1}
                  onPress={() => setDays((value) => Math.max(1, value - 1))}
                  style={[styles.stepButton, days <= 1 && styles.disabled]}
                >
                  <Ionicons name="remove" size={22} color={colors.text} />
                </Pressable>
                <Text style={styles.daysValue} accessibilityLiveRegion="polite">
                  {days === 1 ? '1 смена' : pluralizeRu(days, ['день', 'дня', 'дней'])}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Больше дней"
                  disabled={days >= 30}
                  onPress={() => setDays((value) => Math.min(30, value + 1))}
                  style={[styles.stepButton, days >= 30 && styles.disabled]}
                >
                  <Ionicons name="add" size={22} color={colors.text} />
                </Pressable>
              </View>
            </View>
          ) : null}

          {showNote ? (
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Задача (необязательно): траншея 20 м, поднять плиты…"
              placeholderTextColor={colors.textSoft}
              accessibilityLabel="Описание задачи"
              style={styles.noteInput}
              maxLength={500}
              autoFocus
            />
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => setShowNote(true)}
              style={styles.addNote}
            >
              <Ionicons name="create-outline" size={18} color={colors.primaryDark} />
              <Text style={styles.moreLinkText}>Добавить описание задачи</Text>
            </Pressable>
          )}
        </ScrollView>
      ) : null}

      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <Button
        title={category ? `Заказать · ${category.name}` : 'Заказать'}
        size="large"
        loading={submitting}
        onPress={() => (expanded ? void submit() : setExpanded(true))}
      />

      {expanded ? (
        <Pressable
          accessibilityRole="link"
          onPress={() =>
            router.push({
              pathname: '/orders/new',
              params: {
                ...(categoryId ? { categoryId } : {}),
                ...(address.trim() ? { address: address.trim() } : {}),
              },
            })
          }
          style={styles.moreLink}
        >
          <Text style={styles.moreLinkText}>Подробная заявка с описанием и датами</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    ...shadow.sheet,
  },
  body: { gap: spacing.md },
  handleArea: { alignItems: 'center', justifyContent: 'center', height: 28 },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: colors.border },
  title: { ...typography.heading, color: colors.text },
  addNote: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 36 },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
  },
  addressInput: { flex: 1, fontSize: 16, color: colors.text, minHeight: TAP },
  tiles: { gap: spacing.sm, paddingVertical: 2 },
  tile: {
    width: 92,
    minHeight: 88,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 2,
    borderColor: 'transparent',
    padding: spacing.sm,
    gap: spacing.xs,
    justifyContent: 'space-between',
  },
  tileSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  tileIcon: { fontSize: 26 },
  tileText: { fontSize: 13, lineHeight: 16, fontWeight: '600', color: colors.text },
  tileTextSelected: { color: colors.primaryDark },
  pressed: { opacity: 0.85 },
  muted: { fontSize: 14, color: colors.textMuted, paddingVertical: spacing.lg },
  dateRow: { flexDirection: 'row', gap: spacing.md },
  daysRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  daysLabel: { fontSize: 16, fontWeight: '600', color: colors.text },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepButton: {
    width: TAP,
    height: TAP,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.4 },
  daysValue: {
    minWidth: 80,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  noteInput: {
    minHeight: TAP,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    fontSize: 15,
    color: colors.text,
  },
  error: { color: colors.danger, fontSize: 14 },
  moreLink: { minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  moreLinkText: { color: colors.primaryDark, fontSize: 14, fontWeight: '600' },
});
