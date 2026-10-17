import { useRouter } from 'expo-router';
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
import * as WebBrowser from 'expo-web-browser';
import { PromiseNote } from '@/components/Promise';
import { Button, Card, Input } from '@/components/ui';
import { API_URL, ApiError, becomeProvider } from '@/lib/api';
import { phoneNear } from '@/lib/phoneNear';
import { useAuth } from '@/lib/auth';
import { checkBecomeProvider, modeSwitchKind, type BecomeProviderForm } from '@/lib/modes';
import { setAppMode } from '@/lib/prefs';
import { SITE } from '@/lib/site';
import { colors, spacing } from '@/theme';

/**
 * «Стать исполнителем» под тем же логином (POST /api/account/provider):
 * название, где стоит техника и телефон. После успеха — режим исполнителя и
 * «Техника» с подсказкой «Добавьте первую машину». Заявки и брони заказчика
 * остаются: заказывать можно в режиме «Заказчик».
 */
export default function BecomeProviderScreen() {
  const router = useRouter();
  const { user, mergeUser, refreshUser } = useAuth();
  const [form, setForm] = useState<BecomeProviderForm>({
    companyName: '',
    baseAddress: '',
    phone: '',
  });
  const [fieldError, setFieldError] = useState<{
    field: keyof BecomeProviderForm;
    error: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // 152-ФЗ ст. 10.1: карточка исполнителя (название, база, телефон) публичная.
  const [publicConsent, setPublicConsent] = useState(false);
  // После успеха роль уже «исполнитель» — форма остаётся на экране до перехода.
  const [finished, setFinished] = useState(false);

  const set = (field: keyof BecomeProviderForm) => (value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (fieldError?.field === field) setFieldError(null);
  };

  const openFleet = () => {
    setFinished(true);
    setAppMode('provider');
    router.dismissTo({ pathname: '/(tabs)/provider', params: { welcome: '1' } });
  };

  const submit = async () => {
    Keyboard.dismiss();
    setError(null);
    const checked = checkBecomeProvider(form);
    if (!checked.ok) {
      setFieldError({ field: checked.field, error: checked.error });
      return;
    }
    setFieldError(null);
    if (!publicConsent) {
      setError('Нужно согласие на публикацию карточки исполнителя');
      return;
    }
    setSubmitting(true);
    try {
      const { user: updated } = await becomeProvider({
        ...checked.value,
        near: await phoneNear(),
      });
      mergeUser({ role: updated.role });
      void refreshUser();
      openFleet();
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        // Уже исполнитель (например, второе нажатие) — просто открываем технику.
        mergeUser({ role: 'PROVIDER_ADMIN' });
        void refreshUser();
        openFleet();
        return;
      }
      setError(
        caught instanceof ApiError ? caught.message : 'Не получилось сохранить, попробуйте ещё раз',
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!finished && modeSwitchKind(user?.role) !== 'become') {
    return (
      <View style={styles.container}>
        <Card style={styles.card}>
          <Text style={styles.lead}>
            {user?.role === 'PROVIDER_ADMIN'
              ? 'Вы уже исполнитель. Переключайтесь между режимами «Заказчик» и «Исполнитель» вверху главного экрана или в профиле.'
              : 'Этот вход не может стать исполнителем. Напишите нам, если нужна помощь.'}
          </Text>
          <Button title="Назад" variant="secondary" onPress={() => router.back()} />
        </Card>
      </View>
    );
  }

  const errorFor = (field: keyof BecomeProviderForm) =>
    fieldError?.field === field ? fieldError.error : null;

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
          Добавьте свою технику и получайте заявки в {SITE.name}. Вход тот же: заказывать технику вы
          сможете и дальше, переключателем «Заказчик | Исполнитель».
        </Text>
        <Card style={styles.card}>
          <Input
            label="Название компании или ваше имя"
            value={form.companyName}
            onChangeText={set('companyName')}
            placeholder="ООО «Техника+» или Иван Петров"
            maxLength={200}
            returnKeyType="next"
            error={errorFor('companyName')}
          />
          <Input
            label="Где стоит техника (адрес)"
            value={form.baseAddress}
            onChangeText={set('baseAddress')}
            placeholder="Набережные Челны, Мензелинский тракт, 24"
            maxLength={200}
            returnKeyType="next"
            error={errorFor('baseAddress')}
          />
          <Text style={styles.note}>
            По адресу вас покажут заказчикам на карте. Точку можно поправить потом в разделе
            «Техника».
          </Text>
          <Input
            label="Телефон (необязательно)"
            value={form.phone}
            onChangeText={set('phone')}
            placeholder="+7 900 000-00-00"
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            maxLength={30}
            returnKeyType="done"
            onSubmitEditing={() => void submit()}
            error={errorFor('phone')}
          />
          <Text style={styles.note}>
            По телефону с вами свяжется заказчик, когда вы подтвердите его бронь.
          </Text>
          <Pressable
            style={styles.consentRow}
            onPress={() => setPublicConsent((value) => !value)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: publicConsent }}
          >
            <Switch
              value={publicConsent}
              onValueChange={setPublicConsent}
              trackColor={{ true: colors.primary }}
            />
            <Text style={styles.consentText}>
              Согласен(на) на публикацию карточки исполнителя (название, где стоит техника, телефон)
              по{' '}
              <Text
                style={styles.consentLink}
                onPress={() =>
                  void WebBrowser.openBrowserAsync(`${API_URL}/soglasie-rasprostranenie`)
                }
              >
                условиям согласия
              </Text>
            </Text>
          </Pressable>
          {error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <Button
            title="Стать исполнителем"
            size="large"
            loading={submitting}
            onPress={() => void submit()}
          />
          <PromiseNote />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  lead: { fontSize: 15, lineHeight: 21, color: colors.textMuted },
  card: { gap: spacing.md },
  note: { fontSize: 13, lineHeight: 18, color: colors.textMuted, marginTop: -spacing.xs },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  consentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
  consentText: { flex: 1, fontSize: 13, lineHeight: 18, color: colors.textMuted },
  consentLink: { color: colors.primary, textDecorationLine: 'underline' },
});
