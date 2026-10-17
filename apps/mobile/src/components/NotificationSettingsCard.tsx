import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { NewsletterSetting } from '@/components/NewsletterSetting';
import { Badge, Button, Card } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { eveningOffTime } from '@/lib/line';
import {
  DEFAULT_LINE_REMINDER,
  LINE_REMINDER_TIMES,
  lineReminderEligible,
  lineReminderHint,
  loadLineReminder,
  type LineReminderSettings,
} from '@/lib/lineReminder';
import { applyLineReminder } from '@/lib/useLineReminder';
import {
  createTelegramLink,
  fetchNotificationSettings,
  sendTestNotification,
  unlinkTelegram,
  updateNotificationSettings,
  type NotificationChannelView,
  type NotificationSettings,
} from '@/lib/notifications';
import { pushSupportHint } from '@/lib/push';
import { colors, radius, spacing, TAP } from '@/lib/theme';

function messageOf(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

/**
 * «Утреннее напоминание о линии» — только у исполнителя: локальное
 * уведомление на этом телефоне (lib/lineReminder.ts), вкл/выкл и время.
 */
function LineReminderSetting() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<LineReminderSettings>(DEFAULT_LINE_REMINDER);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const role = user?.role;

  useEffect(() => {
    let cancelled = false;
    void loadLineReminder().then((stored) => !cancelled && setSettings(stored));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!lineReminderEligible(role)) return null;

  const change = async (next: LineReminderSettings) => {
    setSettings(next);
    setSaving(true);
    try {
      const result = await applyLineReminder(next, role);
      setProblem(
        result === 'no-permission'
          ? 'Разрешите уведомления для приложения в настройках телефона — иначе напоминание не придёт.'
          : result === 'unsupported'
            ? 'На этом устройстве напоминание не работает.'
            : null,
      );
    } catch {
      setProblem('Не удалось поставить напоминание. Попробуйте ещё раз.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.channel}>
      <View style={styles.row}>
        <Text style={[styles.label, styles.reminderLabel]}>Утреннее напоминание о линии</Text>
        <Switch
          value={settings.enabled}
          disabled={saving}
          accessibilityLabel="Утреннее напоминание о линии"
          onValueChange={(enabled) => void change({ ...settings, enabled })}
          trackColor={{ true: colors.primary }}
        />
      </View>
      <Text style={styles.hint}>{lineReminderHint(settings, eveningOffTime())}</Text>
      {settings.enabled ? (
        <View style={styles.times} accessibilityRole="radiogroup">
          {LINE_REMINDER_TIMES.map((time) => {
            const active = time === settings.time;
            return (
              <Pressable
                key={time}
                accessibilityRole="radio"
                accessibilityState={{ selected: active, disabled: saving }}
                accessibilityLabel={`Напоминать в ${time}`}
                disabled={saving}
                onPress={() => !active && void change({ ...settings, time })}
                style={[styles.time, active && styles.timeActive]}
              >
                <Text style={[styles.timeText, active && styles.timeTextActive]}>{time}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {problem ? <Text style={styles.error}>{problem}</Text> : null}
    </View>
  );
}

/**
 * «Уведомления» в профиле: Telegram, push, e-mail, WhatsApp и SMS
 * («скоро», пока не настроены на сервере), привязка Telegram и проверка;
 * у исполнителя — ещё утреннее напоминание о линии.
 */
export function NotificationSettingsCard() {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSettings(await fetchNotificationSettings());
      setError(null);
    } catch (caught) {
      setError(messageOf(caught, 'Не удалось загрузить настройки уведомлений'));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // Back from Telegram after «Старт»: show the linked state.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load();
    });
    return () => subscription.remove();
  }, [load]);

  const toggle = async (channel: NotificationChannelView, value: boolean) => {
    setBusy(channel.id);
    setNotice(null);
    try {
      setSettings(await updateNotificationSettings({ [channel.id]: value }));
      setError(null);
    } catch (caught) {
      setError(messageOf(caught, 'Не удалось сохранить'));
    } finally {
      setBusy(null);
    }
  };

  const linkTelegram = async () => {
    setBusy('link');
    try {
      const { url } = await createTelegramLink();
      setNotice('В Telegram нажмите «Старт», затем вернитесь в приложение.');
      await Linking.openURL(url);
    } catch (caught) {
      setError(messageOf(caught, 'Не удалось открыть Telegram'));
    } finally {
      setBusy(null);
    }
  };

  const unlink = async () => {
    setBusy('unlink');
    try {
      await unlinkTelegram();
      await load();
      setNotice('Telegram отвязан.');
    } catch (caught) {
      setError(messageOf(caught, 'Не удалось отвязать'));
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy('test');
    setNotice(null);
    try {
      setNotice((await sendTestNotification()).message);
    } catch (caught) {
      setError(messageOf(caught, 'Не удалось отправить'));
    } finally {
      setBusy(null);
    }
  };

  const pushHint = pushSupportHint();

  return (
    <Card style={styles.card}>
      <Text style={styles.title}>Уведомления</Text>
      <Text style={styles.muted}>
        Куда сообщать о заявках, предложениях и бронях. Telegram и push — бесплатно.
      </Text>
      {settings?.channels.map((channel) => (
        <View key={channel.id} style={styles.channel}>
          <View style={styles.row}>
            <View style={styles.labelRow}>
              <Text style={[styles.label, !channel.available && styles.disabled]}>
                {channel.label}
              </Text>
              {channel.soon ? <Badge text="скоро" /> : null}
              {channel.active ? <Badge text="работает" tone="success" /> : null}
            </View>
            <Switch
              value={channel.enabled}
              disabled={!channel.available || busy !== null}
              onValueChange={(value) => void toggle(channel, value)}
              trackColor={{ true: colors.primary }}
            />
          </View>
          <Text style={styles.hint}>
            {channel.id === 'push' && pushHint ? pushHint : channel.hint}
          </Text>
          {channel.id === 'telegram' && settings.telegram.botConfigured ? (
            settings.telegram.linked ? (
              <Button
                title="Отвязать Telegram"
                variant="secondary"
                disabled={busy !== null}
                loading={busy === 'unlink'}
                onPress={unlink}
              />
            ) : (
              <Button
                title="Подключить Telegram"
                disabled={busy !== null}
                loading={busy === 'link'}
                onPress={linkTelegram}
              />
            )
          ) : null}
        </View>
      ))}
      <LineReminderSetting />
      <NewsletterSetting />
      {settings ? (
        <Button
          title="Проверить уведомления"
          variant="secondary"
          disabled={busy !== null}
          loading={busy === 'test'}
          onPress={test}
        />
      ) : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  title: { fontSize: 16, fontWeight: '600', color: colors.text },
  muted: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  channel: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  label: { fontSize: 15, fontWeight: '500', color: colors.text },
  disabled: { color: colors.textMuted },
  hint: { fontSize: 12, color: colors.textMuted },
  reminderLabel: { flexShrink: 1, paddingRight: spacing.sm },
  times: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  time: {
    minHeight: TAP,
    minWidth: 64,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  timeActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  timeText: { fontSize: 15, fontWeight: '600', color: colors.text },
  timeTextActive: { color: colors.primaryDark },
  notice: { fontSize: 14, color: colors.success },
  error: { fontSize: 14, color: colors.danger },
});
