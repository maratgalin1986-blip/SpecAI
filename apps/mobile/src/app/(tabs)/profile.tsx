import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card } from '@/components/ui';
import { API_URL, type UserRole } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, spacing } from '@/lib/theme';

const ROLE_LABELS: Record<UserRole, string> = {
  CUSTOMER: 'Клиент',
  PROVIDER_ADMIN: 'Поставщик',
  ADMIN: 'Администратор',
};

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

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
        <Row label="Сервер" value={API_URL} />
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
  container: { padding: spacing.xl, alignItems: 'stretch', gap: spacing.md },
  avatar: {
    alignSelf: 'center',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 28, fontWeight: '700', color: colors.primaryDark },
  name: { fontSize: 22, fontWeight: '700', color: colors.text, textAlign: 'center' },
  email: { fontSize: 15, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.md },
  card: { gap: spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  rowLabel: { color: colors.textMuted, fontSize: 14 },
  rowValue: { color: colors.text, fontSize: 14, fontWeight: '500', flexShrink: 1 },
});
