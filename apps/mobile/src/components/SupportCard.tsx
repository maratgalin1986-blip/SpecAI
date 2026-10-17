import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Clipboard,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Button, Card, Chip } from '@/components/ui';
import { formatMoney } from '@/lib/format';
import {
  SUPPORT_TEXT,
  cardDigits,
  readDismissedIds,
  rememberDismissedIds,
  shouldOfferSupport,
  useSupport,
  type PublicSupport,
} from '@/lib/support';
import { colors, spacing, TAP, typography } from '@/theme';

type EnabledSupport = Extract<PublicSupport, { enabled: true }>;

/**
 * Копирование номера. Clipboard из react-native есть и в Expo Go, и в сборке
 * (отдельный модуль не нужен); если не сработал — системное «Поделиться»,
 * откуда номер можно скопировать.
 */
async function copyCard(digits: string): Promise<void> {
  try {
    Clipboard.setString(digits);
  } catch {
    await Share.share({ message: digits }).catch(() => undefined);
  }
}

/** Сама карточка: суммы только подсказывают, перевод — в приложении банка. */
export function SupportCard({
  support,
  onClose,
  onCopied,
  closeLabel = SUPPORT_TEXT.later,
}: {
  support: EnabledSupport;
  onClose?: () => void;
  onCopied?: () => void;
  closeLabel?: string;
}) {
  const [amount, setAmount] = useState<number | 'custom' | null>(null);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await copyCard(cardDigits(support.card));
    setCopied(true);
    onCopied?.();
  };

  return (
    <Card style={styles.card}>
      <View style={styles.titleRow}>
        <Ionicons name="heart-outline" size={22} color={colors.primary} />
        <Text style={styles.title} accessibilityRole="header">
          {SUPPORT_TEXT.title}
        </Text>
      </View>
      <Text style={styles.body}>{SUPPORT_TEXT.body}</Text>
      {support.amounts.length > 0 ? (
        <View style={styles.chips}>
          {support.amounts.map((value) => (
            <Chip
              key={value}
              label={formatMoney(value)}
              selected={amount === value}
              onPress={() => setAmount(value)}
            />
          ))}
          <Chip
            label={SUPPORT_TEXT.custom}
            selected={amount === 'custom'}
            onPress={() => setAmount('custom')}
          />
        </View>
      ) : null}
      {amount !== null ? (
        <Text style={styles.hint}>
          {amount === 'custom'
            ? 'Сумму вы вводите сами в приложении банка — любую.'
            : `Введите ${formatMoney(amount)} в приложении банка.`}
        </Text>
      ) : null}
      <View style={styles.requisites}>
        <Text style={styles.number} selectable>
          {support.card}
        </Text>
        {support.recipient ? (
          <Text style={styles.hint}>Получатель: {support.recipient}</Text>
        ) : null}
        <Text style={styles.hint}>{SUPPORT_TEXT.hint}</Text>
      </View>
      <Button title={SUPPORT_TEXT.copy} variant="dark" onPress={() => void copy()} />
      {copied ? (
        <Text style={styles.thanks} accessibilityLiveRegion="polite">
          {SUPPORT_TEXT.thanks}
        </Text>
      ) : null}
      {onClose ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          onPress={onClose}
          hitSlop={4}
          style={({ pressed }) => [styles.later, pressed && styles.pressed]}
        >
          <Text style={styles.laterText}>{closeLabel}</Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

/**
 * После завершённой брони (заказчик — «Брони», исполнитель — «Мои заказы»):
 * один раз на бронь, пока не нажали «Не сейчас» или не скопировали номер, и
 * только когда владелец включил поддержку.
 */
export function SupportPrompt({
  completedIds,
  style,
}: {
  completedIds: string[];
  style?: StyleProp<ViewStyle>;
}) {
  const support = useSupport();
  const [dismissed, setDismissed] = useState<string[] | null>(null);
  const key = completedIds.join(',');

  useEffect(() => {
    let alive = true;
    void readDismissedIds().then((ids) => {
      if (alive) setDismissed(ids);
    });
    return () => {
      alive = false;
    };
  }, [key]);

  if (!support?.enabled || dismissed === null) return null;
  if (!shouldOfferSupport(support.enabled, completedIds, dismissed)) return null;
  const close = () => {
    setDismissed((prev) => [...completedIds, ...(prev ?? [])]);
    void rememberDismissedIds(completedIds);
  };
  return (
    <View style={style}>
      <SupportCard
        support={support}
        onClose={close}
        onCopied={() => void rememberDismissedIds(completedIds)}
      />
    </View>
  );
}

/** Тихая строка в профиле: открывает ту же карточку в любой момент. */
export function SupportProfileRow() {
  const router = useRouter();
  const support = useSupport();
  if (!support?.enabled) return null;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={SUPPORT_TEXT.row}
      onPress={() => router.push('/support')}
      hitSlop={4}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Ionicons name="heart-outline" size={16} color={colors.textSoft} />
      <Text style={styles.rowText}>{SUPPORT_TEXT.row}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.8 },
  card: { gap: spacing.sm, borderColor: colors.primaryLight, backgroundColor: colors.primarySoft },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { ...typography.heading, color: colors.text, flexShrink: 1 },
  body: { ...typography.small, color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  requisites: { gap: spacing.xxs },
  number: { fontSize: 20, lineHeight: 28, fontWeight: '700', letterSpacing: 1, color: colors.text },
  hint: { ...typography.small, color: colors.textMuted },
  thanks: { ...typography.bodyStrong, color: colors.success, textAlign: 'center' },
  later: { minHeight: TAP, alignItems: 'center', justifyContent: 'center' },
  laterText: { ...typography.bodyStrong, color: colors.textMuted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: TAP,
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
  },
  rowText: { color: colors.textSoft, fontSize: 14, fontWeight: '500' },
});
