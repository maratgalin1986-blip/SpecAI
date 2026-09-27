import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { callCompany } from '@/components/ContactActions';
import { Button, Card, Input } from '@/components/ui';
import { ApiError, createLead } from '@/lib/api';
import { SITE } from '@/lib/site';
import { colors, spacing } from '@/lib/theme';

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

/**
 * «Заказать звонок» — та же заявка, что форма CallbackForm на сайте (POST /api/leads).
 * Доступна без входа: экран вне Stack.Protected в корневом layout.
 */
export default function CallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ source?: string; message?: string }>();
  const source = first(params.source) || 'mobile';
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState(() => first(params.message));
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    Keyboard.dismiss();
    setError(null);
    const digits = phone.replace(/\D/g, '').length;
    if (!name.trim()) {
      setError('Как к вам обращаться?');
      return;
    }
    if (digits < 10 || digits > 15) {
      setError('Укажите телефон полностью, например +7 900 000-00-00');
      return;
    }
    if (!consent) {
      setError('Нужно согласие на обработку персональных данных');
      return;
    }
    setSubmitting(true);
    try {
      await createLead({
        name: name.trim(),
        phone: phone.trim(),
        message: message.trim() || undefined,
        source,
      });
      setSent(true);
    } catch (caught) {
      const text = caught instanceof ApiError ? caught.message : 'Не удалось отправить заявку';
      setError(`${text}. Или позвоните: ${SITE.phone}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Заказать звонок', presentation: 'modal' }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {sent ? (
            <Card style={styles.success}>
              <Text style={styles.successTitle}>Заявка отправлена!</Text>
              <Text style={styles.successText}>
                Перезвоним в рабочее время ({SITE.workingHours}). Срочно — звоните {SITE.phone}.
              </Text>
              <Button title="Позвонить сейчас" onPress={() => void callCompany()} />
              <Button title="Закрыть" variant="secondary" onPress={() => router.back()} />
            </Card>
          ) : (
            <Card style={styles.form}>
              <View style={styles.header}>
                <Text style={styles.title}>Заявка на звонок</Text>
                <Text style={styles.subtitle}>
                  Оставьте телефон — менеджер перезвонит, подберёт технику и назовёт цену.
                </Text>
              </View>
              <Input
                label="Имя"
                value={name}
                onChangeText={setName}
                autoComplete="name"
                textContentType="name"
                placeholder="Как к вам обращаться"
                maxLength={100}
                returnKeyType="next"
              />
              <Input
                label="Телефон"
                value={phone}
                onChangeText={setPhone}
                autoComplete="tel"
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                placeholder="+7 (___) ___-__-__"
                maxLength={30}
                returnKeyType="next"
              />
              <Input
                label="Комментарий (необязательно)"
                value={message}
                onChangeText={setMessage}
                placeholder="Что нужно сделать? Например: траншея под водопровод, на следующей неделе"
                maxLength={1000}
                multiline
                numberOfLines={3}
                style={styles.textarea}
              />
              <Pressable
                style={styles.consentRow}
                onPress={() => setConsent((value) => !value)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: consent }}
              >
                <Switch
                  value={consent}
                  onValueChange={setConsent}
                  trackColor={{ true: colors.primary }}
                />
                <Text style={styles.consentText}>
                  Согласен(на) на обработку персональных данных в соответствии с{' '}
                  <Text
                    style={styles.consentLink}
                    onPress={() => void WebBrowser.openBrowserAsync(`${SITE.url}/privacy`)}
                  >
                    политикой конфиденциальности
                  </Text>
                </Text>
              </Pressable>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Button title="Жду звонка" onPress={handleSubmit} loading={submitting} />
              <Pressable accessibilityRole="button" onPress={() => void callCompany()}>
                <Text style={styles.phoneLink}>Или позвоните сами: {SITE.phone}</Text>
              </Pressable>
            </Card>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  form: { gap: spacing.lg },
  header: { gap: spacing.xs },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  textarea: { minHeight: 88, paddingTop: spacing.md, textAlignVertical: 'top' },
  consentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  consentText: { flex: 1, fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  consentLink: { color: colors.primaryDark, textDecorationLine: 'underline' },
  error: { color: colors.danger, fontSize: 14 },
  phoneLink: {
    color: colors.primaryDark,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: spacing.xs,
  },
  success: { gap: spacing.md, backgroundColor: colors.successLight, borderColor: '#bbf7d0' },
  successTitle: { fontSize: 20, fontWeight: '700', color: '#14532d' },
  successText: { fontSize: 15, color: '#166534', lineHeight: 22 },
});
