import React, { useEffect, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
} from 'react-native';
import { AdminGate } from '@/components/AdminGate';
import { Button, Card, ErrorBanner, Input, Loader } from '@/components/ui';
import { fetchSupportSettings, saveSupportSettings } from '@/lib/adminApi';
import { ApiError } from '@/lib/api';
import { useAdminData } from '@/lib/useAdminData';
import { colors, spacing, typography } from '@/theme';

export default function AdminSupportScreen() {
  return (
    <AdminGate>
      <AdminSupport />
    </AdminGate>
  );
}

/**
 * «Поддержка (донаты)»: номер карты, на которую можно поддержать площадку
 * после завершённого заказа, имя получателя и переключатель. Номер хранится
 * только на сервере (тот же, что в админке на сайте).
 */
function AdminSupport() {
  const { data, setData, error, loading, refreshing, refresh } = useAdminData(fetchSupportSettings);
  const [card, setCard] = useState('');
  const [recipient, setRecipient] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // Пока владелец не начал править, поля повторяют сохранённое на сервере.
  useEffect(() => {
    if (!data || touched) return;
    setCard(data.cardFormatted);
    setRecipient(data.recipient);
    setEnabled(data.enabled);
  }, [data, touched]);

  const edit =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      setTouched(true);
      setMessage(null);
    };

  const save = async () => {
    Keyboard.dismiss();
    // Настройки не загрузились: пустая форма стёрла бы сохранённую карту.
    if (!data) return;
    setSaving(true);
    setMessage(null);
    try {
      const saved = await saveSupportSettings({ card, recipient, enabled });
      // Сохранённое становится «серверным»: поля не откатываются к старому ответу.
      setData(saved);
      setCard(saved.cardFormatted);
      setRecipient(saved.recipient);
      setEnabled(saved.enabled);
      setTouched(false);
      setMessage({
        ok: true,
        text: saved.enabled
          ? 'Сохранено. Предложение поддержать видят после завершённого заказа.'
          : 'Сохранено. Предложение поддержать выключено.',
      });
    } catch (caught) {
      setMessage({
        ok: false,
        text: caught instanceof ApiError ? caught.message : 'Не удалось сохранить',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) return <Loader />;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
      >
        {error ? <ErrorBanner message={error} onRetry={() => void refresh()} /> : null}
        <Text style={styles.intro}>
          После завершённого заказа заказчик и исполнитель видят тихое предложение поддержать
          площадку любой суммой — переводом по номеру карты в своём банке. Это добровольно.
        </Text>
        <Card style={styles.card}>
          <Input
            label="Номер карты (16–19 цифр)"
            value={card}
            onChangeText={edit(setCard)}
            keyboardType="number-pad"
            autoComplete="off"
            autoCorrect={false}
            placeholder="0000 0000 0000 0000"
            maxLength={23}
          />
          <Input
            label="Получатель, как его показывает банк"
            value={recipient}
            onChangeText={edit(setRecipient)}
            placeholder="Например, Иван И."
            maxLength={60}
          />
          <Pressable
            accessibilityRole="switch"
            accessibilityLabel="Показывать предложение поддержать"
            accessibilityState={{ checked: enabled }}
            onPress={() => edit(setEnabled)(!enabled)}
            style={styles.toggle}
          >
            <Text style={styles.toggleLabel}>Показывать предложение поддержать</Text>
            <Switch
              value={enabled}
              onValueChange={edit(setEnabled)}
              trackColor={{ true: colors.success, false: colors.border }}
            />
          </Pressable>
        </Card>
        {message ? (
          <Text
            style={[styles.message, message.ok ? styles.ok : styles.fail]}
            accessibilityRole={message.ok ? undefined : 'alert'}
          >
            {message.text}
          </Text>
        ) : null}
        {!data ? (
          <Text style={[styles.message, styles.fail]} accessibilityRole="alert">
            Настройки не загрузились — потяните экран вниз, чтобы обновить. До этого сохранить
            нельзя, чтобы не стереть номер карты.
          </Text>
        ) : null}
        <Button
          title="Сохранить"
          size="large"
          loading={saving}
          disabled={!data}
          onPress={() => void save()}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  intro: { ...typography.small, color: colors.textMuted },
  card: { gap: spacing.md },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    minHeight: 48,
  },
  toggleLabel: { ...typography.bodyStrong, color: colors.text, flexShrink: 1 },
  message: { ...typography.small },
  ok: { color: colors.success },
  fail: { color: colors.danger },
});
