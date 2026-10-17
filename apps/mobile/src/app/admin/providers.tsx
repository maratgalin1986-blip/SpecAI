import React, { useState } from 'react';
import {
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { AdminGate } from '@/components/AdminGate';
import { Badge, Card, EmptyState, ErrorBanner, Loader } from '@/components/ui';
import { fetchAdminCompanies, setCompanyVerified, type AdminCompany } from '@/lib/adminApi';
import { formatCount, moscowDate } from '@/lib/adminFormat';
import { ApiError } from '@/lib/api';
import { phoneToHref } from '@/lib/format';
import { useAdminData } from '@/lib/useAdminData';
import { colors, spacing, typography } from '@/theme';

export default function AdminProvidersScreen() {
  return (
    <AdminGate>
      <AdminProviders />
    </AdminGate>
  );
}

function omitKey<V>(record: Record<string, V>, key: string): Record<string, V> {
  const next = { ...record };
  delete next[key];
  return next;
}

function AdminProviders() {
  const { data, setData, error, loading, refreshing, refresh } = useAdminData(fetchAdminCompanies);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const setVerified = (company: AdminCompany, verified: boolean) => {
    if (saving[company.id]) return;
    const apply = (value: boolean) =>
      setData(
        (list) =>
          list?.map((item) => (item.id === company.id ? { ...item, verified: value } : item)) ??
          list,
      );
    apply(verified);
    setSaving((prev) => ({ ...prev, [company.id]: true }));
    setErrors((prev) => omitKey(prev, company.id));
    setCompanyVerified(company.id, verified)
      .catch((caught: unknown) => {
        apply(!verified);
        setErrors((prev) => ({
          ...prev,
          [company.id]:
            caught instanceof ApiError ? caught.message : 'Не удалось сохранить отметку',
        }));
      })
      .finally(() => setSaving((prev) => omitKey(prev, company.id)));
  };

  if (loading && !data) return <Loader />;

  return (
    <FlatList
      data={data ?? []}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
      ListHeaderComponent={
        <View style={styles.header}>
          {error ? <ErrorBanner message={error} onRetry={() => void refresh()} /> : null}
          <Text style={styles.intro}>
            «Проверен» видят заказчики рядом с названием компании. Отмечайте после проверки ИНН,
            документов или звонка.
          </Text>
        </View>
      }
      ListEmptyComponent={data ? <EmptyState title="Исполнителей пока нет" /> : null}
      renderItem={({ item }) => (
        <CompanyCard
          company={item}
          saving={Boolean(saving[item.id])}
          error={errors[item.id]}
          onChange={(value) => setVerified(item, value)}
        />
      )}
    />
  );
}

function CompanyCard({
  company,
  saving,
  error,
  onChange,
}: {
  company: AdminCompany;
  saving: boolean;
  error?: string;
  onChange: (verified: boolean) => void;
}) {
  const phone = company.phone;
  return (
    <Card style={styles.card}>
      <View style={styles.titleRow}>
        <Text style={styles.name}>{company.name}</Text>
        {company.isHouse ? <Badge text="Свой парк" tone="dark" /> : null}
      </View>
      <Text style={styles.meta}>
        С {moscowDate(company.createdAt)} · техники {formatCount(company.machines)}
      </Text>
      {phone ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Позвонить ${phone}`}
          onPress={() => void Linking.openURL(phoneToHref(phone))}
          style={({ pressed }) => [styles.phoneWrap, pressed && styles.pressed]}
        >
          <Text style={styles.phone}>{phone}</Text>
        </Pressable>
      ) : (
        <Text style={styles.meta}>Телефон не указан</Text>
      )}
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel="Проверен"
        accessibilityState={{ checked: company.verified, disabled: saving }}
        disabled={saving}
        onPress={() => onChange(!company.verified)}
        style={styles.toggle}
      >
        <Text style={styles.toggleLabel}>Проверен</Text>
        <Switch
          value={company.verified}
          disabled={saving}
          onValueChange={onChange}
          trackColor={{ true: colors.success, false: colors.border }}
        />
      </Pressable>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  header: { gap: spacing.sm },
  intro: { ...typography.small, color: colors.textMuted },
  card: { gap: spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  name: { ...typography.heading, color: colors.text, flexShrink: 1 },
  meta: { ...typography.small, color: colors.textMuted },
  phoneWrap: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  phone: { ...typography.bodyStrong, color: colors.primaryDark },
  pressed: { opacity: 0.85 },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.xs,
  },
  toggleLabel: { ...typography.bodyStrong, color: colors.text },
  error: { ...typography.small, color: colors.danger },
});
