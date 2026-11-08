import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button, Card, Input, Loader } from '@/components/ui';
import { adminLogin } from '@/lib/adminApi';
import { useAdminSession } from '@/lib/adminSession';
import { ApiError } from '@/lib/api';
import { colors, spacing, typography } from '@/theme';

/**
 * Экраны меню администратора показываются только после входа по паролю
 * админки. Без сессии (не входили, вышли, сервер ответил 401) вместо экрана —
 * поле пароля; после входа экран открывается сам.
 */
export function AdminGate({ children }: { children: React.ReactNode }) {
  const { loaded, session } = useAdminSession();
  if (!loaded) return <Loader />;
  if (!session) return <AdminPasswordForm />;
  return <>{children}</>;
}

function AdminPasswordForm() {
  const { notice } = useAdminSession();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    Keyboard.dismiss();
    if (!password) {
      setError('Введите пароль администратора');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await adminLogin(password);
      // Экран сменится сам: AdminGate увидит сессию.
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Не удалось войти, попробуйте ещё раз',
      );
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.icon}>
          <Ionicons name="shield-checkmark-outline" size={32} color={colors.primary} />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          Вход для администратора
        </Text>
        <Text style={styles.text}>
          Пароль администратора площадки — тот же, что для админки на сайте. Ваш аккаунт в
          приложении не меняется.
        </Text>
        {notice ? (
          <Card style={styles.notice}>
            <Text style={styles.noticeText}>{notice}</Text>
          </Card>
        ) : null}
        <Input
          label="Пароль"
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            if (error) setError(null);
          }}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
          error={error}
        />
        <Button title="Войти" size="large" loading={submitting} onPress={() => void submit()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flexGrow: 1, padding: spacing.lg, gap: spacing.lg, justifyContent: 'center' },
  icon: {
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.dark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...typography.title, color: colors.text, textAlign: 'center' },
  text: { ...typography.small, color: colors.textMuted, textAlign: 'center' },
  notice: { backgroundColor: colors.warningLight, borderColor: colors.warningLight },
  noticeText: { ...typography.small, color: colors.warningText },
});
