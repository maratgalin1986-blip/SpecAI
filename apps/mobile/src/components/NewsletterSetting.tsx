import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { ApiError } from '@/lib/api';
import {
  fetchNewsSubscription,
  NEWS_CONSENT_LABEL,
  setNewsSubscription,
  type NewsSubscription,
} from '@/lib/news';
import { colors, spacing } from '@/lib/theme';

/** «Заявки рядом за неделю» в «Уведомлениях»: подписка и отписка (/api/account/news). */
export function NewsletterSetting() {
  const [view, setView] = useState<NewsSubscription | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      fetchNewsSubscription()
        .then((next) => !cancelled && setView(next))
        .catch(() => undefined);
      return () => {
        cancelled = true;
      };
    }, []),
  );

  if (!view?.available) return null;

  const change = async (subscribed: boolean) => {
    setSaving(true);
    setError(null);
    try {
      setView(await setNewsSubscription(subscribed));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.box}>
      <View style={styles.row}>
        <Text style={styles.label}>{NEWS_CONSENT_LABEL}</Text>
        <Switch
          value={view.subscribed}
          disabled={saving}
          accessibilityLabel="Еженедельное письмо"
          onValueChange={(value) => void change(value)}
          trackColor={{ true: colors.primary }}
        />
      </View>
      <Text style={styles.hint}>Письмо «Заявки рядом за неделю» на e-mail аккаунта.</Text>
      {view.subscribed && view.emailVerified === false ? (
        <Text style={styles.warn}>Письма начнут приходить после подтверждения e-mail.</Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { flex: 1, fontSize: 15, fontWeight: '500', color: colors.text, paddingRight: spacing.sm },
  hint: { fontSize: 12, color: colors.textMuted },
  warn: { fontSize: 12, color: colors.warningText },
  error: { fontSize: 14, color: colors.danger },
});
