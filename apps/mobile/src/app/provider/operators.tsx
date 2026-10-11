import { Stack, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Badge, Button, Card, EmptyState, ErrorBanner, Input, Loader } from '@/components/ui';
import {
  ApiError,
  createOperator,
  fetchOperators,
  updateOperator,
  type Operator,
  type OperatorInput,
} from '@/lib/api';
import { colors, spacing, typography } from '@/theme';

interface FormState {
  name: string;
  phone: string;
  licenseNumber: string;
  email: string;
  password: string;
}

const EMPTY: FormState = { name: '', phone: '', licenseNumber: '', email: '', password: '' };

function toInput(form: FormState): OperatorInput & { name: string } {
  return {
    name: form.name.trim(),
    phone: form.phone.trim(),
    licenseNumber: form.licenseNumber.trim(),
    ...(form.email.trim() ? { email: form.email.trim(), password: form.password } : {}),
  };
}

function OperatorForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: FormState;
  submitLabel: string;
  onSubmit: (form: FormState) => Promise<void>;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof FormState) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    if (!form.name.trim()) {
      setError('Укажите имя машиниста');
      return;
    }
    if (form.email.trim() && form.password.length < 8) {
      setError('Временный пароль — не короче 8 символов');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(form);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card style={styles.form}>
      <Input label="Имя машиниста" value={form.name} onChangeText={set('name')} maxLength={200} />
      <Input
        label="Телефон"
        value={form.phone}
        onChangeText={set('phone')}
        keyboardType="phone-pad"
        maxLength={30}
      />
      <Input
        label="Удостоверение (№)"
        value={form.licenseNumber}
        onChangeText={set('licenseNumber')}
        maxLength={60}
      />
      <Text style={styles.hint}>
        Вход в приложение: e-mail и временный пароль, которые вы передадите машинисту лично.
      </Text>
      <Input
        label="E-mail для входа"
        value={form.email}
        onChangeText={set('email')}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={254}
      />
      <Input
        label="Временный пароль"
        value={form.password}
        onChangeText={set('password')}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={100}
        placeholder="От 8 символов"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title={submitLabel} loading={saving} onPress={() => void submit()} />
      {onCancel ? <Button title="Отмена" variant="ghost" onPress={onCancel} /> : null}
    </Card>
  );
}

function OperatorRow({
  operator,
  onChanged,
}: {
  operator: Operator;
  onChanged: (operator: Operator) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const toggle = () => {
    const run = async () => {
      setBusy(true);
      try {
        const result = await updateOperator(operator.id, { active: !operator.active });
        onChanged(result.operator);
      } catch (caught) {
        Alert.alert('Ошибка', caught instanceof ApiError ? caught.message : 'Не удалось изменить');
      } finally {
        setBusy(false);
      }
    };
    if (operator.active) {
      Alert.alert('Отключить машиниста?', `${operator.name} больше не получит новых броней.`, [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Отключить', style: 'destructive', onPress: () => void run() },
      ]);
    } else {
      void run();
    }
  };

  if (editing) {
    return (
      <OperatorForm
        initial={{
          name: operator.name,
          phone: operator.phone ?? '',
          licenseNumber: operator.licenseNumber ?? '',
          email: operator.email ?? '',
          password: '',
        }}
        submitLabel="Сохранить"
        onSubmit={async (form) => {
          const result = await updateOperator(operator.id, toInput(form));
          onChanged(result.operator);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <Card style={styles.row}>
      <View style={styles.rowHeader}>
        <Text style={[styles.name, !operator.active && styles.inactive]} numberOfLines={2}>
          {operator.name}
        </Text>
        <Badge
          text={operator.active ? 'Работает' : 'Отключён'}
          tone={operator.active ? 'success' : 'neutral'}
        />
      </View>
      <Text style={styles.meta}>
        {[
          operator.phone,
          operator.licenseNumber ? `удостоверение ${operator.licenseNumber}` : null,
          operator.email ? `вход: ${operator.email}` : 'без входа в приложение',
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
      <View style={styles.actions}>
        <View style={styles.flex}>
          <Button title="Изменить" variant="secondary" onPress={() => setEditing(true)} />
        </View>
        <View style={styles.flex}>
          <Button
            title={operator.active ? 'Отключить' : 'Включить'}
            variant={operator.active ? 'ghost' : 'dark'}
            loading={busy}
            onPress={toggle}
          />
        </View>
      </View>
    </Card>
  );
}

/**
 * «Машинисты» исполнителя: список, добавление, правка, отключение и вход в
 * приложение (e-mail + временный пароль). Машинист в приложении видит
 * только назначенные ему брони.
 */
export default function OperatorsScreen() {
  const [operators, setOperators] = useState<Operator[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchOperators();
      setOperators(data.operators);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось загрузить машинистов');
      setOperators((prev) => prev ?? []);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const upsert = (operator: Operator) =>
    setOperators((prev) => {
      const list = prev ?? [];
      const next = list.some((row) => row.id === operator.id)
        ? list.map((row) => (row.id === operator.id ? operator : row))
        : [...list, operator];
      return next.sort(
        (a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'ru'),
      );
    });

  if (operators === null) return <Loader />;

  return (
    <>
      <Stack.Screen options={{ title: 'Машинисты' }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FlatList
          data={operators}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => <OperatorRow operator={item} onChanged={upsert} />}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          ListHeaderComponent={
            <View style={styles.header}>
              <Text style={styles.intro}>
                Назначайте машиниста на бронь во вкладке «Мои заказы» — он увидит адрес объекта,
                поведёт статусы смены и заполнит табель. Цены и другие заказы ему не видны.
              </Text>
              {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
              {adding ? (
                <OperatorForm
                  initial={EMPTY}
                  submitLabel="Добавить"
                  onSubmit={async (form) => {
                    const result = await createOperator(toInput(form));
                    upsert(result.operator);
                    setAdding(false);
                  }}
                  onCancel={() => setAdding(false)}
                />
              ) : (
                <Button title="Добавить машиниста" size="large" onPress={() => setAdding(true)} />
              )}
            </View>
          }
          ListEmptyComponent={
            !error ? (
              <EmptyState
                title="Машинистов пока нет"
                description="Добавьте первого — и назначайте его на брони."
              />
            ) : null
          }
        />
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
  header: { gap: spacing.md, marginBottom: spacing.md },
  intro: { fontSize: 14, lineHeight: 20, color: colors.textMuted },
  form: { gap: spacing.sm },
  hint: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  row: { gap: spacing.sm },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  name: { ...typography.bodyStrong, flex: 1, color: colors.text },
  inactive: { color: colors.textSoft, textDecorationLine: 'line-through' },
  meta: { fontSize: 13, color: colors.textMuted },
  actions: { flexDirection: 'row', gap: spacing.sm },
  error: { fontSize: 13, color: colors.danger },
});
