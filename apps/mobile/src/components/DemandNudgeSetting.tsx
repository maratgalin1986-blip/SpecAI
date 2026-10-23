import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { ApiError } from '@/lib/api';
import {
  DEMAND_NUDGE_LABEL,
  fetchDemandNudge,
  setDemandNudge,
  type DemandNudgeSetting as View_,
} from '@/lib/aktualno';
import { colors, spacing } from '@/lib/theme';

/** «Спрос рядом» раз в день в «Уведомлениях» (/api/account/demand-nudge). */
export function DemandNudgeSetting() {
  const [view, setView] = useState<View_ | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      fetchDemandNudge()
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
      setView(await setDemandNudge(enabled));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.box}>
      <View style={styles.row}>
        <Text style={styles.label}>{DEMAND_NUDGE_LABEL}</Text>
        <Switch
          value={view.enabled}
          disabled={saving}
          accessibilityLabel="Спрос рядом"
          onValueChange={(value) => void change(value)}
          trackColor={{ true: colors.primary }}
        />
      </View>
      <Text style={styles.hint}>
        Раз в день, днём по вашему времени — в приложение и Telegram, если они включены выше. Если
        вы уже на линии, сообщения не будет.
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { flex: 1, fontSize: 15, fontWeight: '500', color: colors.text, paddingRight: spacing.sm },
  hint: { fontSize: 12, color: colors.textMuted },
  error: { fontSize: 14, color: colors.danger },
});
