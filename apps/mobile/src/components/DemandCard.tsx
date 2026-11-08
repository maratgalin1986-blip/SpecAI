import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/ui';
import { fetchDemand, type DemandSummary } from '@/lib/api';
import { colors, radius, spacing } from '@/theme';

/**
 * «Спрос» в ленте исполнителя: где и какой техники не хватает за две недели
 * («На завтра: экскаватор-погрузчик в городе Набережные Челны — свободных
 * мало — цены выше») и переход на карту спроса (/demand).
 */
export function DemandCard() {
  const router = useRouter();
  const [demand, setDemand] = useState<DemandSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchDemand()
      .then((data) => !cancelled && setDemand(data))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!demand) return null;
  const top = demand.categories.slice(0, 3);

  return (
    <Card style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Открыть карту спроса"
        onPress={() => router.push('/demand')}
        style={styles.header}
      >
        <Ionicons name="pulse-outline" size={22} color={colors.primaryDark} />
        <View style={styles.flex}>
          <Text style={styles.title}>Спрос</Text>
          <Text style={styles.sub}>
            {demand.providerText ?? 'За две недели заявок не было — спрос низкий'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </Pressable>
      {top.length > 0 ? (
        <View style={styles.rows}>
          {top.map((row) => (
            <View key={row.categoryId} style={styles.row}>
              <View style={[styles.dot, { backgroundColor: demand.colors[row.level] }]} />
              <Text style={styles.rowText} numberOfLines={1}>
                {row.name}
              </Text>
              <Text style={styles.rowMeta}>
                {demand.labels[row.level]} · {row.orders} / {row.supply}
              </Text>
            </View>
          ))}
          <Text style={styles.legend}>заявок за 14 дней / свободных машин</Text>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { gap: spacing.sm, padding: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  sub: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  rows: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 28 },
  dot: { width: 10, height: 10, borderRadius: radius.pill },
  rowText: { flex: 1, fontSize: 14, color: colors.text },
  rowMeta: { fontSize: 12, color: colors.textMuted },
  legend: { fontSize: 11, color: colors.textSoft },
});
