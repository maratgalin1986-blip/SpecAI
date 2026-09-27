import { Link } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { ContactActions } from '@/components/ContactActions';
import { Badge, EmptyState, ErrorBanner, Input } from '@/components/ui';
import { ApiError, fetchEquipment, type Equipment } from '@/lib/api';
import { EQUIPMENT_STATUS_LABELS, formatRate } from '@/lib/format';
import { colors, radius, spacing } from '@/lib/theme';

const PAGE_SIZE = 20;

function EquipmentCard({ item }: { item: Equipment }) {
  const image = item.imageUrls[0];
  const rate = formatRate(item);
  return (
    <Link href={{ pathname: '/equipment/[id]', params: { id: item.id } }} asChild>
      <Pressable style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
        {image ? (
          <Image source={{ uri: image }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Text style={styles.imagePlaceholderText}>Нет фото</Text>
          </View>
        )}
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {item.category.name}
            {item.location?.city ? ` · ${item.location.city}` : ''}
          </Text>
          <View style={styles.cardFooter}>
            <View style={styles.priceBlock}>
              <Text style={styles.price}>
                {rate.price}
                <Text style={styles.priceUnit}>{rate.unit}</Text>
              </Text>
              {rate.note ? <Text style={styles.priceNote}>{rate.note}</Text> : null}
            </View>
            <Badge
              text={EQUIPMENT_STATUS_LABELS[item.status] ?? item.status}
              tone={item.status === 'AVAILABLE' ? 'success' : 'neutral'}
            />
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

export default function CatalogScreen() {
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [items, setItems] = useState<Equipment[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(
    async (nextPage: number, mode: 'initial' | 'refresh' | 'more') => {
      const id = ++requestId.current;
      if (mode === 'initial') setLoading(true);
      if (mode === 'refresh') setRefreshing(true);
      if (mode === 'more') setLoadingMore(true);
      setError(null);
      try {
        const data = await fetchEquipment({
          query: appliedQuery || undefined,
          page: nextPage,
          pageSize: PAGE_SIZE,
        });
        if (id !== requestId.current) return;
        setItems((prev) => (mode === 'more' ? [...prev, ...data.equipment] : data.equipment));
        setPage(data.page);
        setTotalPages(data.totalPages);
        setTotal(data.total);
      } catch (caught) {
        if (id !== requestId.current) return;
        setError(caught instanceof ApiError ? caught.message : 'Не удалось загрузить каталог');
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
        }
      }
    },
    [appliedQuery],
  );

  useEffect(() => {
    void load(1, 'initial');
  }, [load]);

  // Дебаунс поиска: применяем запрос через 400 мс после остановки ввода.
  useEffect(() => {
    const timer = setTimeout(() => setAppliedQuery(query.trim()), 400);
    return () => clearTimeout(timer);
  }, [query]);

  const handleEndReached = () => {
    if (loading || loadingMore || refreshing || page >= totalPages) return;
    void load(page + 1, 'more');
  };

  return (
    <View style={styles.screen}>
      <View style={styles.searchBar}>
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder="Поиск техники: экскаватор, кран…"
          returnKeyType="search"
          clearButtonMode="while-editing"
          onSubmitEditing={() => setAppliedQuery(query.trim())}
        />
        {!loading && !error ? (
          <Text style={styles.count}>{total > 0 ? `Найдено: ${total}` : 'Ничего не найдено'}</Text>
        ) : null}
        <ContactActions
          source="mobile:catalog"
          message="Нужна техника — подберите вариант и назовите цену"
          compact
        />
      </View>

      {error && items.length === 0 ? (
        <View style={styles.padded}>
          <ErrorBanner message={error} onRetry={() => void load(1, 'initial')} />
        </View>
      ) : null}

      {loading && items.length === 0 ? (
        <ActivityIndicator style={styles.loader} size="large" color={colors.primary} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <EquipmentCard item={item} />}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load(1, 'refresh')}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            !error ? (
              <EmptyState
                title="Техника не найдена"
                description="Попробуйте изменить поисковый запрос."
              />
            ) : null
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={styles.footerLoader} color={colors.primary} />
            ) : error && items.length > 0 ? (
              <ErrorBanner message={error} onRetry={() => void load(page + 1, 'more')} />
            ) : null
          }
          keyboardShouldPersistTaps="handled"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  searchBar: {
    padding: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  count: { fontSize: 13, color: colors.textMuted },
  padded: { padding: spacing.lg },
  loader: { marginTop: spacing.xl },
  footerLoader: { marginVertical: spacing.lg },
  list: { padding: spacing.lg, paddingBottom: spacing.xl },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  cardPressed: { opacity: 0.9 },
  image: { width: '100%', height: 160, backgroundColor: colors.border },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  imagePlaceholderText: { color: colors.textSoft, fontSize: 14 },
  cardBody: { padding: spacing.md, gap: spacing.xs },
  cardTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  cardMeta: { fontSize: 13, color: colors.textMuted },
  cardFooter: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  priceBlock: { flexShrink: 1, gap: 2 },
  price: { fontSize: 16, fontWeight: '700', color: colors.primaryDark },
  priceUnit: { fontSize: 13, fontWeight: '400', color: colors.textMuted },
  priceNote: { fontSize: 12, color: colors.textMuted },
});
