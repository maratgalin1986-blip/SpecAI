import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useRef, useState } from 'react';
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
import { Button, Card, Input } from '@/components/ui';
import { ApiError, sendProposal } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  PROPOSAL_KINDS,
  PROPOSAL_SUCCESS,
  prefillProposal,
  proposalBody,
  serverFieldErrors,
  validateProposal,
  type ProposalErrors,
  type ProposalForm,
} from '@/lib/proposals';
import { SITE } from '@/lib/site';
import { colors, radius, spacing, TAP, typography } from '@/theme';

/**
 * «Предложения и партнёрство»: идея по сервису или предложение о
 * сотрудничестве. Доступно и без входа (экран вне Stack.Protected);
 * вошедшему имя и e-mail подставляются сами.
 */
export default function ProposalsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [form, setForm] = useState<ProposalForm>(() => ({
    kind: 'IDEA',
    company: '',
    message: '',
    consent: false,
    ...prefillProposal(user),
  }));
  const [errors, setErrors] = useState<ProposalErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const prefilled = useRef(Boolean(user));

  // Пользователь загрузился после открытия экрана: подставляем, не затирая введённое.
  useEffect(() => {
    if (!user || prefilled.current) return;
    prefilled.current = true;
    const known = prefillProposal(user);
    setForm((current) => ({
      ...current,
      name: current.name || known.name,
      contact: current.contact || known.contact,
    }));
  }, [user]);

  const set = <K extends keyof ProposalForm>(key: K, value: ProposalForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const handleSubmit = async () => {
    Keyboard.dismiss();
    setError(null);
    const found = validateProposal(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSending(true);
    try {
      await sendProposal(proposalBody(form));
      setSent(true);
    } catch (caught) {
      if (caught instanceof ApiError) {
        setErrors(serverFieldErrors(caught.details));
        setError(caught.message);
      } else {
        setError('Не удалось отправить. Попробуйте ещё раз');
      }
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Card style={styles.success}>
          <Text style={styles.successTitle} accessibilityRole="header">
            {PROPOSAL_SUCCESS}
          </Text>
          <Text style={styles.successText}>
            Ответим по контакту, который вы оставили. Если появится что-то ещё — напишите снова.
          </Text>
          <Button
            title="Закрыть"
            variant="secondary"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          />
        </Card>
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Text style={styles.lead}>
          Есть идея, как сделать сервис удобнее, или хотите сотрудничать с {SITE.name}? Расскажите
          подробнее, что вы предлагаете — мы читаем каждое сообщение.
        </Text>

        <View style={styles.kinds} accessibilityRole="radiogroup">
          {PROPOSAL_KINDS.map((kind) => {
            const active = form.kind === kind.value;
            return (
              <Pressable
                key={kind.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                accessibilityLabel={kind.title}
                onPress={() => set('kind', kind.value)}
                style={({ pressed }) => [
                  styles.kind,
                  active && styles.kindActive,
                  pressed && styles.pressed,
                ]}
              >
                <View style={[styles.radio, active && styles.radioActive]}>
                  {active ? <View style={styles.radioDot} /> : null}
                </View>
                <View style={styles.flex}>
                  <Text style={styles.kindTitle}>{kind.title}</Text>
                  <Text style={styles.kindHint}>{kind.hint}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <Card style={styles.form}>
          <Input
            label="Имя"
            value={form.name}
            onChangeText={(value) => set('name', value)}
            autoComplete="name"
            textContentType="name"
            maxLength={100}
            error={errors.name}
          />
          <Input
            label="Телефон или e-mail для ответа"
            value={form.contact}
            onChangeText={(value) => set('contact', value)}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="+7 900 000-00-00 или mail@example.ru"
            maxLength={120}
            error={errors.contact}
          />
          <Input
            label="Компания (необязательно)"
            value={form.company}
            onChangeText={(value) => set('company', value)}
            textContentType="organizationName"
            maxLength={200}
            error={errors.company}
          />
          <Input
            label="Расскажите подробнее"
            value={form.message}
            onChangeText={(value) => set('message', value)}
            placeholder={
              form.kind === 'PARTNERSHIP'
                ? 'Кто вы, что предлагаете и чем это полезно заказчикам и исполнителям'
                : 'Например: хочу видеть на карте, сколько машина едет до объекта'
            }
            maxLength={3000}
            multiline
            numberOfLines={5}
            style={styles.textarea}
            error={errors.message}
          />
          <View>
            <Pressable
              style={styles.consentRow}
              onPress={() => set('consent', !form.consent)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: form.consent }}
            >
              <Switch
                value={form.consent}
                onValueChange={(value) => set('consent', value)}
                trackColor={{ true: colors.primary }}
              />
              <Text style={styles.consentText}>
                Согласен(на) на обработку персональных данных в соответствии с{' '}
                <Text
                  style={styles.consentLink}
                  onPress={() => void WebBrowser.openBrowserAsync(`${SITE.url}/soglasie`)}
                >
                  условиями согласия
                </Text>
              </Text>
            </Pressable>
            {errors.consent ? <Text style={styles.fieldError}>{errors.consent}</Text> : null}
          </View>
          {error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <Button title="Отправить" onPress={() => void handleSubmit()} loading={sending} />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.85 },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  lead: { fontSize: 15, lineHeight: 21, color: colors.textMuted },
  kinds: { gap: spacing.sm },
  kind: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: TAP + 8,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  kindActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.textSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  kindTitle: { ...typography.bodyStrong, color: colors.text },
  kindHint: { ...typography.small, color: colors.textMuted },
  form: { gap: spacing.lg },
  textarea: { minHeight: 120, paddingTop: spacing.md, textAlignVertical: 'top' },
  consentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: TAP },
  consentText: { flex: 1, fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  consentLink: { color: colors.primaryDark, textDecorationLine: 'underline' },
  fieldError: { color: colors.danger, fontSize: 13, marginTop: spacing.xs },
  error: { color: colors.danger, fontSize: 14 },
  success: { gap: spacing.md, backgroundColor: colors.successLight, borderColor: colors.success },
  successTitle: { fontSize: 20, fontWeight: '700', color: colors.success },
  successText: { fontSize: 15, color: colors.text, lineHeight: 22 },
});
