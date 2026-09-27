import { Link } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ContactActions } from '@/components/ContactActions';
import { Button, Input } from '@/components/ui';
import { ApiError, API_URL } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { SITE } from '@/lib/site';
import { colors, spacing } from '@/lib/theme';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    Keyboard.dismiss();
    setError(null);
    if (!email.trim() || !password) {
      setError('Введите e-mail и пароль');
      return;
    }
    setSubmitting(true);
    try {
      await login(email, password);
      // Навигацию выполняет Stack.Protected в корневом layout.
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось войти');
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
        <Pressable style={styles.container} onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.header}>
            <View style={styles.logo}>
              <Text style={styles.logoText}>СП16</Text>
            </View>
            <Text style={styles.title}>{SITE.name}</Text>
            <Text style={styles.subtitle}>{SITE.tagline}</Text>
          </View>

          <View style={styles.form}>
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
              label="Пароль"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              textContentType="password"
              placeholder="••••••••"
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button title="Войти" onPress={handleSubmit} loading={submitting} />
            <Pressable
              accessibilityRole="link"
              onPress={() => void WebBrowser.openBrowserAsync(`${API_URL}/forgot-password`)}
            >
              <Text style={styles.link}>Забыли пароль?</Text>
            </Pressable>
            <Link href="/(auth)/register" style={styles.link}>
              Нет аккаунта? Зарегистрироваться
            </Link>
          </View>

          <View style={styles.contacts}>
            <ContactActions source="mobile:login" compact />
            <Link href="/about" style={styles.link}>
              О компании {SITE.name}
            </Link>
          </View>

          <Text style={styles.footer}>Сервер: {API_URL}</Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  container: { flex: 1, padding: spacing.xl, justifyContent: 'center', gap: spacing.xl },
  header: { alignItems: 'center', gap: spacing.sm },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { color: '#fff', fontSize: 22, fontWeight: '800' },
  title: { fontSize: 28, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 15, color: colors.textMuted, textAlign: 'center' },
  contacts: { gap: spacing.sm },
  form: { gap: spacing.lg },
  error: { color: colors.danger, fontSize: 14 },
  link: {
    color: colors.primaryDark,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: spacing.xs,
  },
  footer: { color: colors.textSoft, fontSize: 12, textAlign: 'center' },
});
