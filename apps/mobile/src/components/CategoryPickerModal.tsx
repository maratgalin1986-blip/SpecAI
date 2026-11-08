import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Category } from '@/lib/api';
import { categorySections } from '@/lib/categoryGroups';
import { categoryIcon } from '@/lib/orderFlow';
import { colors, radius, spacing, TAP, typography } from '@/theme';

/**
 * Шторка «Все виды техники»: поиск и полный список по группам («Землеройная
 * техника», «Подъёмная техника», …) — как рубрика «Спецтехника» на Авито.
 * Используется в быстром заказе, подробной заявке и форме техники исполнителя.
 */
export function CategoryPickerModal({
  visible,
  categories,
  selectedId,
  onSelect,
  onClose,
  title = 'Все виды техники',
  allowNone = false,
}: {
  visible: boolean;
  categories: Category[];
  selectedId: string | null;
  onSelect: (category: Category | null) => void;
  onClose: () => void;
  title?: string;
  /** Показать строку «Любая техника», снимающую выбор. */
  allowNone?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const sections = useMemo(() => categorySections(categories, query), [categories, query]);

  const choose = (category: Category | null) => {
    onSelect(category);
    setQuery('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: Math.max(insets.top, spacing.md) }]}>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Закрыть"
            onPress={onClose}
            hitSlop={8}
            style={styles.close}
          >
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.searchRow}>
          <Ionicons name="search" size={18} color={colors.textSoft} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Найти: миксер, ямобур, трал…"
            placeholderTextColor={colors.textSoft}
            accessibilityLabel="Поиск вида техники"
            style={styles.searchInput}
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>

        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
          ListHeaderComponent={
            allowNone && !query ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: selectedId === null }}
                onPress={() => choose(null)}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <Text style={styles.rowIcon}>🛠️</Text>
                <Text style={[styles.rowText, selectedId === null && styles.rowTextSelected]}>
                  Любая техника — подобрать по описанию
                </Text>
                {selectedId === null ? (
                  <Ionicons name="checkmark" size={20} color={colors.primary} />
                ) : null}
              </Pressable>
            ) : null
          }
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
          renderItem={({ item }) => {
            const selected = item.id === selectedId;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={item.name}
                accessibilityState={{ selected }}
                onPress={() => choose(item)}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <Text style={styles.rowIcon}>{categoryIcon(item.name, item.emoji)}</Text>
                <Text style={[styles.rowText, selected && styles.rowTextSelected]}>
                  {item.name}
                </Text>
                {selected ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {categories.length === 0
                ? 'Список видов техники ещё загружается…'
                : 'Ничего не нашлось — опишите задачу словами, диспетчер подберёт технику.'}
            </Text>
          }
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    minHeight: TAP,
  },
  title: { ...typography.heading, color: colors.text },
  close: { width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.sm,
    minHeight: TAP,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
  },
  searchInput: { flex: 1, fontSize: 16, color: colors.text, minHeight: TAP },
  sectionHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: colors.textMuted,
    backgroundColor: colors.card,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowIcon: { fontSize: 22, width: 30, textAlign: 'center' },
  rowText: { flex: 1, fontSize: 16, color: colors.text },
  rowTextSelected: { color: colors.primaryDark, fontWeight: '700' },
  pressed: { backgroundColor: colors.surfaceMuted },
  empty: { padding: spacing.lg, fontSize: 15, color: colors.textMuted, lineHeight: 22 },
});
