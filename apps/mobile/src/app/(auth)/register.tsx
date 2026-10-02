import { Link } from 'expo-router';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Input } from '@/components/ui';
import { API_URL, ApiError, register } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { SITE } from '@/lib/site';
import { colors, spacing } from '@/lib/theme';

type AccountType = 'CUSTOMER' | 'PROVIDER';

const ACCOUNT_TYPES: { value: AccountType; label: string; hint: string }[] = [
  { value: 'CUSTOMER', label: 'Арендую технику', hint: 'Заявки, брони, отзывы' },
  { value: 'PROVIDER', label: 'Сдаю технику', hint: 'Своя техника и заявки заказчиков' },
];

/**
 * Регистрация (поля как у веб-формы) с автологином: заказчик или исполнитель.
 * Исполнитель указывает компанию и адрес базы — сервер найдёт его на карте и
 * проверит регион (как на сайте).
 */
export default function RegisterScreen() {
  const { login } = useAuth();
  const [accountType, setAccountType] = useState<AccountType>('CUSTOMER');
  const [companyName, setCompanyName] = useState('');
  const [baseAddress, setBaseAddress] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    Keyboard.dismiss();
    setError(null);
    if (!name.trim() || !email.trim() || !password) {
      setError('Заполните имя, e-mail и пароль');
      return;
    }
    if (accountType === 'PROVIDER' && !companyName.trim()) {
      setError('Укажите название компании');
      return;
    }
    if (accountType === 'PROVIDER' && baseAddress.trim().length < 3) {
      setError('Укажите адрес базы: город, улица, дом — по нему вас найдут на карте');
      return;
    }
    if (password.length < 8) {
      setError('Пароль должен быть не короче 8 символов');
      return;
    }
    if (!consent) {
      setError('Нужно согласие на обработку персональных данных');
      return;
    }
    setSubmitting(true);
    try {
      // consent: true — сервер без него не создаёт аккаунт (152-ФЗ).
      const payload = {
        name: name.trim(),
        email: email.trim(),
        password,
        phone: phone.trim() || undefined,
        consent: true as const,
      };
      await register(
        accountType === 'PROVIDER'
          ? {
              ...payload,
              accountType,
              companyName: companyName.trim(),
              baseAddress: baseAddress.trim(),
            }
          : { ...payload, accountType },
      );
      // Аккаунт создан — сразу входим; навигацию выполнит Stack.Protected.
      await login(email, password);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось зарегистрироваться');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <Pressable onPress={Keyboard.dismiss} accessible={false} style={styles.form}>
            <View style={styles.header}>
              <Text style={styles.title}>Регистрация в {SITE.name}</Text>
              <Text style={styles.subtitle}>
                Заказчик размещает заявки и бронирует технику, исполнитель публикует свою технику и
                отвечает на заявки. Бесплатно. Без аккаунта можно позвонить {SITE.phone}.
              </Text>
            </View>

            <View style={styles.types} accessibilityRole="radiogroup">
              {ACCOUNT_TYPES.map((type) => {
                const active = type.value === accountType;
                return (
                  <Pressable
                    key={type.value}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    onPress={() => setAccountType(type.value)}
                    style={[styles.type, active && styles.typeActive]}
                  >
                    <Text style={[styles.typeLabel, active && styles.typeLabelActive]}>
                      {type.label}
                    </Text>
                    <Text style={styles.typeHint}>{type.hint}</Text>
                  </Pressable>
                );
              })}
            </View>

            {accountType === 'PROVIDER' ? (
              <>
                <Input
                  label="Название компании"
                  value={companyName}
                  onChangeText={setCompanyName}
                  placeholder="ООО «Техника+» или ИП Иванов"
                  returnKeyType="next"
                />
                <Input
                  label="Адрес базы (где стоит техника)"
                  value={baseAddress}
                  onChangeText={setBaseAddress}
                  placeholder="Набережные Челны, Мензелинский тракт, 24"
                  returnKeyType="next"
                />
                <Text style={styles.typeHint}>
                  По адресу вас покажут на карте исполнителей. Точку можно поправить потом в
                  «Кабинете».
                </Text>
              </>
            ) : null}

            <Input
              label="Имя"
              value={name}
              onChangeText={setName}
              autoComplete="name"
              textContentType="name"
              placeholder="Иван Петров"
              returnKeyType="next"
            />
            <Input
              label="E-mail"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              placeholder="you@example.com"
              returnKeyType="next"
            />
            <Input
              label="Телефон (необязательно)"
              value={phone}
              onChangeText={setPhone}
              autoComplete="tel"
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              placeholder="+7 900 000-00-00"
              returnKeyType="next"
            />
            <Input
              label="Пароль"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              placeholder="Не менее 8 символов"
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
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
                  onPress={() => void WebBrowser.openBrowserAsync(`${API_URL}/privacy`)}
                >
                  политикой конфиденциальности
                </Text>
              </Text>
            </Pressable>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button title="Создать аккаунт" onPress={handleSubmit} loading={submitting} />

            <Link href="/(auth)/login" style={styles.link}>
              Уже есть аккаунт? Войти
            </Link>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  container: { flexGrow: 1, padding: spacing.xl, justifyContent: 'center' },
  form: { gap: spacing.lg },
  header: { gap: spacing.sm, marginBottom: spacing.sm },
  title: { fontSize: 26, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  types: { flexDirection: 'row', gap: spacing.sm },
  type: {
    flex: 1,
    gap: 2,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  typeActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  typeLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  typeLabelActive: { color: colors.primaryDark },
  typeHint: { fontSize: 12, color: colors.textMuted, lineHeight: 16 },
  consentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  consentText: { flex: 1, fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  consentLink: { color: colors.primaryDark, textDecorationLine: 'underline' },
  error: { color: colors.danger, fontSize: 14 },
  link: {
    color: colors.primaryDark,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
});
