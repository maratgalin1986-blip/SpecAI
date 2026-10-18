import { Link, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { Button } from '@/components/ui';
import { ApiError } from '@/lib/api';
import {
  fetchPriceAsk,
  PRICE_ASK_LABEL,
  setPriceAsk,
  type PriceAskSetting as View_,
} from '@/lib/aktualno';
import { colors, spacing } from '@/lib/theme';

/** Еженедельное «обновите цены и свободные дни» в «Уведомлениях» (/api/account/price-ask). */
export function PriceAskSetting() {
  const [view, setView] = useState<View_ | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      fetchPriceAsk()
        .then((next) => !cancelled && setView(next))
        .catch(() => undefined);
      return () => {
        cancelled = true;
      };
    }, []),
  );

  if (!view?.available) return null;

  const change = async (enabled: boolean) => {
    setSaving(true);
    setError(null);
    try {
      setView(await setPriceAsk(enabled));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.box}>
      <View style={styles.row}>
        <Text style={styles.label}>{PRICE_ASK_LABEL}</Text>
        <Switch
          value={view.enabled}
          disabled={saving}
          accessibilityLabel="Напоминание о ценах"
          onValueChange={(value) => void change(value)}
          trackColor={{ true: colors.primary }}
        />
      </View>
      <Text style={styles.hint}>По понедельникам утром, по выбранным выше каналам.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

/** «Цены и свободные дни» на главной исполнителя: только руководителю компании-исполнителя. */
export function AktualnoCard() {
  const [available, setAvailable] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      fetchPriceAsk()
        .then((next) => !cancelled && setAvailable(next.available))
        .catch(() => undefined);
      return () => {
        cancelled = true;
      };
    }, []),
  );

  if (!available) return null;
  return (
    <Link href="/provider/aktualno" asChild>
      <Button title="Цены и свободные дни — обновить за 30 секунд" variant="secondary" />
    </Link>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { flex: 1, fontSize: 15, fontWeight: '500', color: colors.text, paddingRight: spacing.sm },
  hint: { fontSize: 12, color: colors.textMuted },
  error: { fontSize: 14, color: colors.danger },
});
