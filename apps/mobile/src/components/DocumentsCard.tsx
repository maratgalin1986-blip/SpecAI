import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Badge, Card } from '@/components/ui';
import type { DocumentsSummary } from '@/lib/api';
import { pluralizeRu } from '@/lib/format';
import { colors, spacing } from '@/theme';

/**
 * «Документы» на вкладке «Техника»: сколько действует, скоро истекает и
 * просрочено; переход на экран документов. Напоминания приходят за 30 дней
 * и в день окончания срока (сервер, api/cron/daily).
 */
export function DocumentsCard({ summary }: { summary: DocumentsSummary | null }) {
  const router = useRouter();
  const total = summary?.total ?? 0;
  return (
    <Card style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Документы компании и техники"
        onPress={() => router.push('/provider/documents')}
        style={styles.row}
      >
        <Ionicons name="document-text-outline" size={22} color={colors.primaryDark} />
        <View style={styles.flex}>
          <Text style={styles.title}>Документы</Text>
          <Text style={styles.sub}>
            {total === 0
              ? 'СТС, ПСМ, удостоверения, страховка — напомним за 30 дней до срока'
              : `${pluralizeRu(total, ['документ', 'документа', 'документов'])} · напомним за 30 дней до срока`}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </Pressable>
      {summary && (summary.expired > 0 || summary.expiring > 0) ? (
        <View style={styles.badges}>
          {summary.expired > 0 ? (
            <Badge text={`Просрочено: ${summary.expired}`} tone="danger" />
          ) : null}
          {summary.expiring > 0 ? (
            <Badge text={`Истекает: ${summary.expiring}`} tone="warning" />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { gap: spacing.sm, padding: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  sub: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
