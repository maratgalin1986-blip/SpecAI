import { Link, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ContactActions } from '@/components/ContactActions';
import { ModeSwitchCard, ProfileShortcuts } from '@/components/ProfileShortcuts';
import { NotificationSettingsCard } from '@/components/NotificationSettingsCard';
import { Badge, Button, Card } from '@/components/ui';
import { API_URL, ApiError, sendVerificationEmail, type UserRole } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { SITE } from '@/lib/site';
import { colors, spacing } from '@/lib/theme';

const ROLE_LABELS: Record<UserRole, string> = {
  CUSTOMER: 'Клиент',
  PROVIDER_ADMIN: 'Исполнитель',
  ADMIN: 'Администратор',
};

export default function ProfileScreen() {
  const { user, logout, refreshUser } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  // При каждом открытии вкладки перечитываем пользователя: статус подтверждения
  // e-mail меняется после перехода по ссылке из письма.
  useFocusEffect(
    useCallback(() => {
      void refreshUser();
    }, [refreshUser]),
  );

  const handleResend = async () => {
    setSending(true);
    try {
      const result = await sendVerificationEmail();
      if (result.alreadyVerified) {
        await refreshUser();
      } else {
        setSent(true);
      }
    } catch (caught) {
      Alert.alert(
        'Ошибка',
        caught instanceof ApiError ? caught.message : 'Не удалось отправить письмо',
      );
    } finally {
      setSending(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Выйти из аккаунта?', undefined, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Выйти',
        style: 'destructive',
        onPress: async () => {
          setLoggingOut(true);
          await logout();
        },
      },
    ]);
  };

  const initials = (user?.name ?? '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials || '?'}</Text>
      </View>
      <Text style={styles.name}>{user?.name ?? '—'}</Text>
      <Text style={styles.email}>{user?.email ?? ''}</Text>

      <Card style={styles.card}>
        <Row label="Роль" value={user ? (ROLE_LABELS[user.role] ?? user.role) : '—'} />
        <View style={styles.row}>
          <Text style={styles.rowLabel}>E-mail</Text>
          {user?.emailVerified === undefined ? (
            <Text style={styles.rowValue}>—</Text>
          ) : user.emailVerified ? (
            <Badge text="Подтверждён" tone="success" />
          ) : (
            <Badge text="Не подтверждён" tone="warning" />
          )}
        </View>
        {__DEV__ ? <Row label="Сервер" value={API_URL} /> : null}
      </Card>

      <ModeSwitchCard />
      <ProfileShortcuts />

      {user && user.emailVerified === null ? (
        <Card style={styles.card}>
          <Text style={styles.verifyTitle}>Подтвердите e-mail</Text>
          <Text style={styles.verifyText}>
            Мы отправили письмо со ссылкой на {user.email}. Без подтверждения часть уведомлений
            может не доходить.
          </Text>
          {sent ? (
            <Text style={styles.verifySent}>Письмо отправлено — проверьте почту.</Text>
          ) : (
            <Button
              title="Отправить письмо ещё раз"
              variant="secondary"
              loading={sending}
              onPress={handleResend}
            />
          )}
        </Card>
      ) : null}

      <NotificationSettingsCard />

      <Card style={styles.card}>
        <Text style={styles.companyTitle}>{SITE.name}</Text>
        <Text style={styles.companyText}>
          {SITE.tagline}. {SITE.city}, {SITE.region}. {SITE.workingHours}.
        </Text>
        <ContactActions source="mobile:profile" />
        <Link href="/about" style={styles.aboutLink}>
          О компании и контакты →
        </Link>
      </Card>

      <Button title="Выйти" variant="danger" onPress={handleLogout} loading={loggingOut} />
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    alignItems: 'stretch',
    gap: spacing.md,
  },
  avatar: {
    alignSelf: 'center',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.dark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 28, fontWeight: '800', color: colors.primary },
  name: { fontSize: 22, fontWeight: '700', color: colors.text, textAlign: 'center' },
  email: { fontSize: 15, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.md },
  card: { gap: spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  rowLabel: { color: colors.textMuted, fontSize: 14 },
  rowValue: { color: colors.text, fontSize: 14, fontWeight: '500', flexShrink: 1 },
  verifyTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  verifyText: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  verifySent: { fontSize: 14, color: colors.success, fontWeight: '600' },
  companyTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  companyText: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  aboutLink: { fontSize: 15, fontWeight: '600', color: colors.primaryDark, textAlign: 'center' },
});
