import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Badge, EmptyState, ErrorBanner, Segmented } from '@/components/ui';
import { ApiError, fetchProviders, imageUri, type ProviderCard } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { pluralizeRu } from '@/lib/format';
import { SITE } from '@/lib/site';
import { colors, radius, shadow, spacing } from '@/theme';

type Sort = 'rating' | 'fleet' | 'newest';

const SORTS: readonly { value: Sort; label: string }[] = [
  { value: 'rating', label: 'Рейтинг' },
  { value: 'fleet', label: 'Парк' },
  { value: 'newest', label: 'Новые' },
];

/**
 * Публичный список исполнителей — компаний со своей техникой (как на сайте
 * /providers): «Проверен», рейтинг, выполненные заказы, парк, город базы,
 * радиус выезда. Телефонов здесь нет: заявка уходит через форму, контакты
 * открываются после подтверждения брони. Доступен и без входа.
 */
export default function ProvidersScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const [sort, setSort] = useState<Sort>('rating');
  const [items, setItems] = useState<ProviderCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      if (mode === 'initial') setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const data = await fetchProviders({ sort });
        setItems(data.providers);
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.message : 'Не удалось загрузить исполнителей');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [sort],
  );

  useEffect(() => {
    void load('initial');
  }, [load]);

  // Заказ у компании: вошедший — в форму заявки, гость — заказать звонок.
  const order = (card: ProviderCard) => {
    if (token) {
      router.push('/orders/new');
    } else {
      router.push({
        pathname: '/callback',
        params: {
          source: `mobile:provider:${card.id}`,
          message: `Хочу заказать технику у «${card.name}»`,
        },
      });
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Segmented options={SORTS} value={sort} onChange={setSort} />
        <Text style={styles.hint}>
          Контакты исполнителя откроются после подтверждения брони — ваш номер не попадёт в чужие
          базы.
        </Text>
      </View>

      {error && items.length === 0 ? (
        <View style={styles.padded}>
          <ErrorBanner message={error} onRetry={() => void load('initial')} />
        </View>
      ) : null}

      {loading && items.length === 0 ? (
        <ActivityIndicator style={styles.loader} size="large" color={colors.primary} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ProviderRow card={item} onOrder={() => order(item)} />}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load('refresh')}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={
            !error ? (
              <EmptyState
                title="Исполнителей пока нет"
                description="Список появится, как только компании со своей техникой встанут на линию."
              />
            ) : null
          }
        />
      )}
    </View>
  );
}

function ProviderRow({ card, onOrder }: { card: ProviderCard; onOrder: () => void }) {
  const photos = card.photos.map(imageUri).filter((uri): uri is string => Boolean(uri));
  return (
    <View style={styles.card} accessibilityLabel={`Исполнитель ${card.name}`}>
      <View style={styles.cardHead}>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>{card.isHouse ? `Парк ${SITE.name}` : card.city}</Text>
          <Text style={styles.title} numberOfLines={2}>
            {card.name}
          </Text>
        </View>
        {card.rating !== null ? (
          <View style={styles.rating}>
            <Text style={styles.ratingValue}>★ {card.rating.toFixed(1)}</Text>
            <Text style={styles.ratingCount}>
              {pluralizeRu(card.ratingCount, ['отзыв', 'отзыва', 'отзывов'])}
            </Text>
          </View>
        ) : null}
      </View>

      {photos.length > 0 ? (
        <View style={styles.photos}>
          {photos.map((uri) => (
            <Image key={uri} source={{ uri }} style={styles.photo} resizeMode="cover" />
          ))}
        </View>
      ) : null}

      <Text style={styles.fleet}>{card.fleetSummary}</Text>
      <View style={styles.badges}>
        {card.badges.map((badge) => (
          <Badge key={badge} text={badge} tone={badge === 'Проверен' ? 'dark' : 'neutral'} />
        ))}
      </View>
      <Text style={styles.meta}>
        {card.radiusLabel} · {card.sinceLabel}
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Заказать у ${card.name}`}
        onPress={onOrder}
        style={({ pressed }) => [styles.orderButton, pressed && styles.pressed]}
      >
        <Ionicons name="construct-outline" size={18} color={colors.onPrimary} />
        <Text style={styles.orderText}>Заказать у этой компании</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  pressed: { opacity: 0.85 },
  header: {
    padding: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  hint: { fontSize: 12, color: colors.textMuted, lineHeight: 16 },
  padded: { padding: spacing.lg },
  loader: { marginTop: spacing.xl },
  list: { padding: spacing.lg, paddingBottom: spacing.xxl },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadow.card,
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.primaryDark,
  },
  title: { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 2 },
  rating: { alignItems: 'flex-end' },
  ratingValue: { fontSize: 18, fontWeight: '800', color: colors.text },
  ratingCount: { fontSize: 12, color: colors.textMuted },
  photos: { flexDirection: 'row', gap: spacing.xs },
  photo: { flex: 1, aspectRatio: 4 / 3, borderRadius: radius.md, backgroundColor: colors.border },
  fleet: { fontSize: 14, color: colors.text },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  meta: { fontSize: 13, color: colors.textMuted },
  orderButton: {
    marginTop: spacing.xs,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  orderText: { color: colors.onPrimary, fontSize: 15, fontWeight: '700' },
});
