import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DateField } from '@/components/DateField';
import {
  Badge,
  Button,
  Card,
  Chip,
  ErrorBanner,
  Input,
  Loader,
  SectionTitle,
} from '@/components/ui';
import {
  ApiError,
  createDocument,
  deleteDocument,
  fetchMyEquipment,
  type Equipment,
  type ProviderDocument,
} from '@/lib/api';
import {
  DOCUMENT_KINDS,
  DOCUMENT_STATUS_LABELS,
  documentKindLabel,
  useProviderDocuments,
} from '@/lib/documents';
import { addDays, formatDate, startOfDay, toIsoDate } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';

const STATUS_TONE = {
  ok: 'success',
  expiring: 'warning',
  expired: 'danger',
  none: 'neutral',
} as const;

function DocumentRow({
  doc,
  machineName,
  onDelete,
}: {
  doc: ProviderDocument;
  machineName: string | null;
  onDelete: (doc: ProviderDocument) => void;
}) {
  return (
    <Card style={styles.docCard}>
      <View style={styles.docTop}>
        <View style={styles.flex}>
          <Text style={styles.docTitle}>
            {documentKindLabel(doc.kind)}
            {doc.number ? ` № ${doc.number}` : ''}
          </Text>
          <Text style={styles.docMeta}>
            {machineName ?? doc.operatorName ?? 'Компания'}
            {doc.expiresAt ? ` · до ${formatDate(doc.expiresAt)}` : ' · без срока'}
          </Text>
        </View>
        <Badge text={DOCUMENT_STATUS_LABELS[doc.status]} tone={STATUS_TONE[doc.status]} />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Удалить ${documentKindLabel(doc.kind)}`}
        onPress={() => onDelete(doc)}
        style={styles.delete}
      >
        <Ionicons name="trash-outline" size={16} color={colors.danger} />
        <Text style={styles.deleteText}>Удалить</Text>
      </Pressable>
    </Card>
  );
}

/**
 * Документы исполнителя: СТС, ПСМ, удостоверение машиниста, страховка,
 * техосмотр — по компании и по машинам (?equipmentId= открывает список
 * одной машины и подставляет её в форму). Сервер напоминает за 30 дней и в день срока.
 */
export default function DocumentsScreen() {
  const { equipmentId: paramEquipmentId } = useLocalSearchParams<{ equipmentId?: string }>();
  const { documents, error, reload } = useProviderDocuments();
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [kind, setKind] = useState('STS');
  const [equipmentId, setEquipmentId] = useState<string | null>(paramEquipmentId ?? null);
  const [operatorName, setOperatorName] = useState('');
  const [number, setNumber] = useState('');
  const [hasExpiry, setHasExpiry] = useState(true);
  const [expiresAt, setExpiresAt] = useState(() => addDays(startOfDay(new Date()), 365));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    fetchMyEquipment()
      .then((data) => setEquipment(data.equipment.filter((item) => item.status !== 'RETIRED')))
      .catch(() => setEquipment([]));
  }, []);

  const machineName = (id: string | null) => equipment.find((item) => item.id === id)?.name ?? null;

  const add = async () => {
    setFormError(null);
    setSaving(true);
    try {
      await createDocument({
        kind,
        equipmentId,
        operatorName: operatorName.trim() || null,
        number: number.trim() || null,
        expiresAt: hasExpiry ? toIsoDate(expiresAt) : null,
      });
      setNumber('');
      await reload();
    } catch (caught) {
      setFormError(caught instanceof ApiError ? caught.message : 'Не удалось сохранить документ');
    } finally {
      setSaving(false);
    }
  };

  const remove = (doc: ProviderDocument) => {
    Alert.alert('Удалить документ?', documentKindLabel(doc.kind), [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDocument(doc.id);
            await reload();
          } catch (caught) {
            Alert.alert(
              'Ошибка',
              caught instanceof ApiError ? caught.message : 'Не удалось удалить',
            );
          }
        },
      },
    ]);
  };

  if (documents === null) return <Loader />;

  const shown = paramEquipmentId
    ? documents.filter((doc) => doc.equipmentId === paramEquipmentId)
    : documents;

  return (
    <>
      <Stack.Screen options={{ title: 'Документы' }} />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {error ? <ErrorBanner message={error} onRetry={() => void reload()} /> : null}
        <Text style={styles.intro}>
          Напомним за 30 дней до окончания срока и в день окончания. Просроченные документы
          отмечаются на карточке машины.
        </Text>

        <SectionTitle>
          {paramEquipmentId
            ? `Документы: ${machineName(paramEquipmentId) ?? 'машина'}`
            : 'Все документы'}
        </SectionTitle>
        {shown.length === 0 ? (
          <Text style={styles.empty}>Документов пока нет — добавьте первый ниже.</Text>
        ) : (
          shown.map((doc) => (
            <DocumentRow
              key={doc.id}
              doc={doc}
              machineName={machineName(doc.equipmentId)}
              onDelete={remove}
            />
          ))
        )}

        <SectionTitle>Добавить документ</SectionTitle>
        <Card style={styles.form}>
          <Text style={styles.label}>Вид</Text>
          <View style={styles.chips}>
            {DOCUMENT_KINDS.map((item) => (
              <Chip
                key={item.value}
                label={item.label}
                selected={kind === item.value}
                onPress={() => setKind(item.value)}
              />
            ))}
          </View>
          <Text style={styles.label}>Чей документ</Text>
          <View style={styles.chips}>
            <Chip
              label="Компания / машинист"
              selected={equipmentId === null}
              onPress={() => setEquipmentId(null)}
            />
            {equipment.map((item) => (
              <Chip
                key={item.id}
                label={item.name}
                selected={equipmentId === item.id}
                onPress={() => setEquipmentId(item.id)}
              />
            ))}
          </View>
          {kind === 'OPERATOR_LICENSE' || equipmentId === null ? (
            <Input
              label="Машинист (для удостоверения)"
              value={operatorName}
              onChangeText={setOperatorName}
              maxLength={200}
            />
          ) : null}
          <Input label="Номер" value={number} onChangeText={setNumber} maxLength={100} />
          <View style={styles.expiryRow}>
            <Chip
              label={hasExpiry ? 'Есть срок действия' : 'Без срока'}
              selected={hasExpiry}
              onPress={() => setHasExpiry((value) => !value)}
            />
          </View>
          {hasExpiry ? (
            <DateField label="Действует до" value={expiresAt} onChange={setExpiresAt} />
          ) : null}
          {formError ? <Text style={styles.error}>{formError}</Text> : null}
          <Button title="Добавить документ" loading={saving} onPress={() => void add()} />
        </Card>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl * 2, gap: spacing.md },
  intro: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  empty: { fontSize: 14, color: colors.textMuted },
  docCard: { gap: spacing.sm },
  docTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  docTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  docMeta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  delete: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 32 },
  deleteText: { fontSize: 13, color: colors.danger, fontWeight: '600' },
  form: { gap: spacing.md },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  expiryRow: { flexDirection: 'row', borderRadius: radius.md },
  error: { color: colors.danger, fontSize: 14 },
});
