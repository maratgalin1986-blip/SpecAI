import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button, Card, ErrorBanner, Input } from '@/components/ui';
import {
  ApiError,
  createEquipment,
  extractSpecsFromFile,
  fetchCategories,
  updateEquipment,
  uploadFile,
  type Category,
  type Equipment,
  type EquipmentStatus,
  type SpecValue,
} from '@/lib/api';
import { EQUIPMENT_STATUS_OPTIONS, suggestShiftRate } from '@/lib/format';
import { colors, radius, spacing } from '@/lib/theme';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // Anthropic не принимает изображения больше 5 МБ

interface Photo {
  url: string;
  name: string;
}

interface SpecRow {
  key: string;
  value: string;
}

/** Строки характеристик → объект specs (пустые ключи отбрасываем, числа приводим). */
function specsFromRows(rows: SpecRow[]): Record<string, SpecValue> | undefined {
  const specs: Record<string, SpecValue> = {};
  for (const row of rows) {
    const key = row.key.trim();
    const value = row.value.trim();
    if (!key || !value) continue;
    const numeric = Number(value.replace(',', '.'));
    specs[key] =
      value !== '' && !Number.isNaN(numeric) && /^[\d.,\s-]+$/.test(value) ? numeric : value;
  }
  return Object.keys(specs).length > 0 ? specs : undefined;
}

/** specs из базы → строки для правки. */
function rowsFromSpecs(specs: Record<string, unknown> | null | undefined): SpecRow[] {
  if (!specs || typeof specs !== 'object') return [];
  return Object.entries(specs)
    .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
    .map(([key, value]) => ({ key, value: String(value) }));
}

function guessMimeType(asset: ImagePicker.ImagePickerAsset): string {
  if (asset.mimeType) return asset.mimeType;
  const ext = asset.uri.split('?')[0]?.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

/**
 * Форма техники поставщика: добавление (без `initial`) и правка своей машины
 * (PATCH /api/equipment/[id]) — статус, цены за час и смену, описание,
 * характеристики, фото. «Снята с публикации» скрывает машину из каталога и с карты.
 */
export function EquipmentForm({
  initial,
  onSaved,
}: {
  initial?: Equipment;
  onSaved: (equipment: Equipment, created: boolean) => void;
}) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);

  const [name, setName] = useState(initial?.name ?? '');
  const [categoryId, setCategoryId] = useState(initial?.category.id ?? '');
  const [make, setMake] = useState(initial?.make ?? '');
  const [model, setModel] = useState(initial?.model ?? '');
  const [year, setYear] = useState(initial?.year ? String(initial.year) : '');
  const [status, setStatus] = useState<EquipmentStatus>(
    (initial?.status as EquipmentStatus | undefined) ?? 'AVAILABLE',
  );
  const [hourlyRate, setHourlyRate] = useState(
    initial?.hourlyRate ? String(Number(initial.hourlyRate)) : '',
  );
  const [dailyRate, setDailyRate] = useState(initial ? String(Number(initial.dailyRate)) : '');
  // true, когда пользователь сам ввёл цену смены: автоподстановка «час × 8» выключается.
  const [dailyTouched, setDailyTouched] = useState(Boolean(initial));
  const [description, setDescription] = useState(initial?.description ?? '');
  const [photos, setPhotos] = useState<Photo[]>(() =>
    (initial?.imageUrls ?? []).map((url, index) => ({ url, name: `Фото ${index + 1}` })),
  );
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [specRows, setSpecRows] = useState<SpecRow[]>(() => rowsFromSpecs(initial?.specs));

  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCategories = async () => {
    setCategoriesError(null);
    try {
      const data = await fetchCategories();
      setCategories(data.categories);
    } catch (caught) {
      setCategoriesError(
        caught instanceof ApiError ? caught.message : 'Не удалось загрузить категории',
      );
    }
  };

  useEffect(() => {
    void loadCategories();
  }, []);

  const handlePickPhotos = async () => {
    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Нет доступа к фото. Разрешите доступ в настройках устройства.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 5,
      quality: 0.8,
    });
    if (result.canceled || result.assets.length === 0) return;

    setUploading(true);
    const uploaded: Photo[] = [];
    let lastError: string | null = null;
    try {
      for (const [index, asset] of result.assets.entries()) {
        const type = guessMimeType(asset);
        const fileName = asset.fileName ?? `photo-${Date.now()}-${index}.${type.split('/')[1]}`;
        if (asset.fileSize && asset.fileSize > MAX_IMAGE_BYTES) {
          lastError = `Изображение «${fileName}» больше 5 МБ и не было загружено`;
          continue;
        }
        try {
          const file = await uploadFile({ uri: asset.uri, name: fileName, type });
          uploaded.push({ url: file.url, name: fileName });
        } catch (caught) {
          lastError =
            caught instanceof ApiError ? caught.message : `Не удалось загрузить файл «${fileName}»`;
        }
      }
    } finally {
      setUploading(false);
    }
    if (uploaded.length > 0) {
      setPhotos((prev) => [...prev, ...uploaded]);
      const last = uploaded[uploaded.length - 1];
      if (last) setSelectedUrl(last.url);
    }
    if (lastError) setError(lastError);
  };

  const removePhoto = (url: string) => {
    setPhotos((prev) => prev.filter((photo) => photo.url !== url));
    setSelectedUrl((current) => (current === url ? null : current));
  };

  const handleExtract = async () => {
    if (!selectedUrl) return;
    setError(null);
    setExtracting(true);
    try {
      const data = await extractSpecsFromFile(selectedUrl);
      setSpecRows(
        Object.entries(data.specs ?? {}).map(([key, value]) => ({ key, value: String(value) })),
      );
      if (data.make && !make.trim()) setMake(data.make);
      if (data.model && !model.trim()) setModel(data.model);
      if (data.year && !year.trim()) setYear(String(data.year));
      if (!name.trim() && (data.make || data.model)) {
        setName([data.make, data.model].filter(Boolean).join(' '));
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось извлечь характеристики');
    } finally {
      setExtracting(false);
    }
  };

  const updateSpecRow = (index: number, patch: Partial<SpecRow>) => {
    setSpecRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const removeSpecRow = (index: number) => {
    setSpecRows((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    setError(null);
    if (!name.trim()) return setError('Укажите название');
    if (!categoryId) return setError('Выберите категорию');
    const rate = Number(dailyRate.replace(',', '.'));
    if (!dailyRate.trim() || Number.isNaN(rate) || rate <= 0) {
      return setError('Укажите цену за смену 8 ч (число больше нуля)');
    }
    const hourly = hourlyRate.trim() ? Number(hourlyRate.replace(',', '.')) : undefined;
    if (hourly !== undefined && (Number.isNaN(hourly) || hourly <= 0)) {
      return setError('Цена за машино-час должна быть числом больше нуля');
    }
    const yearNumber = year.trim() ? Number(year) : undefined;
    if (yearNumber !== undefined && (!Number.isInteger(yearNumber) || yearNumber < 1950)) {
      return setError('Год выпуска должен быть целым числом не меньше 1950');
    }

    setSubmitting(true);
    try {
      if (initial) {
        const { equipment } = await updateEquipment(initial.id, {
          name: name.trim(),
          categoryId,
          status,
          make: make.trim() || null,
          model: model.trim() || null,
          year: yearNumber ?? null,
          dailyRate: rate,
          hourlyRate: hourly ?? null,
          description: description.trim() || null,
          specs: specsFromRows(specRows) ?? null,
          imageUrls: photos.map((photo) => photo.url),
        });
        onSaved(equipment, false);
      } else {
        const { equipment } = await createEquipment({
          name: name.trim(),
          categoryId,
          status,
          make: make.trim() || undefined,
          model: model.trim() || undefined,
          year: yearNumber,
          dailyRate: rate,
          hourlyRate: hourly,
          description: description.trim() || undefined,
          specs: specsFromRows(specRows),
          imageUrls: photos.map((photo) => photo.url),
        });
        onSaved(equipment, true);
      }
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : initial
            ? 'Не удалось сохранить изменения'
            : 'Не удалось добавить технику',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const busy = uploading || extracting || submitting;

  return (
    <>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Card style={styles.section}>
            <Input
              label="Название *"
              value={name}
              onChangeText={setName}
              placeholder="Экскаватор CAT 320"
            />

            <View style={styles.field}>
              <Text style={styles.label}>Категория *</Text>
              {categoriesError ? (
                <ErrorBanner message={categoriesError} onRetry={() => void loadCategories()} />
              ) : (
                <View style={styles.chips}>
                  {categories.map((category) => {
                    const active = category.id === categoryId;
                    return (
                      <Pressable
                        key={category.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        onPress={() => setCategoryId(category.id)}
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
                          {category.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                  {categories.length === 0 ? (
                    <Text style={styles.hint}>Загружаем категории…</Text>
                  ) : null}
                </View>
              )}
            </View>

            <View style={styles.rowFields}>
              <View style={styles.flex}>
                <Input
                  label="Марка"
                  value={make}
                  onChangeText={setMake}
                  placeholder="Caterpillar"
                />
              </View>
              <View style={styles.flex}>
                <Input label="Модель" value={model} onChangeText={setModel} placeholder="320" />
              </View>
            </View>
            <View style={styles.rowFields}>
              <View style={styles.flex}>
                <Input
                  label="Год выпуска"
                  value={year}
                  onChangeText={setYear}
                  placeholder="2020"
                  keyboardType="number-pad"
                />
              </View>
              <View style={styles.flex}>
                <Input
                  label="₽ за машино-час"
                  value={hourlyRate}
                  onChangeText={(value) => {
                    setHourlyRate(value);
                    // Как на сайте: смена 8 ч = часовая × 8 при каждом вводе,
                    // пока пользователь сам не изменил цену смены.
                    if (!dailyTouched) setDailyRate(suggestShiftRate(value));
                  }}
                  placeholder="2500"
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
            <Input
              label="₽ за смену 8 ч *"
              value={dailyRate}
              onChangeText={(value) => {
                setDailyRate(value);
                // Очистили поле — снова подставляем из часовой ставки.
                setDailyTouched(value.trim() !== '');
              }}
              placeholder="20000"
              keyboardType="decimal-pad"
            />
            <Input
              label="Описание"
              value={description}
              onChangeText={setDescription}
              placeholder="Состояние, комплектация, условия аренды…"
              multiline
              numberOfLines={4}
              style={styles.textarea}
            />
            <View style={styles.field}>
              <Text style={styles.label}>Статус</Text>
              <View style={styles.chips}>
                {EQUIPMENT_STATUS_OPTIONS.map((option) => {
                  const active = option.value === status;
                  return (
                    <Pressable
                      key={option.value}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => setStatus(option.value)}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {status === 'RETIRED' ? (
                <Text style={styles.hint}>
                  Машина не видна в каталоге и на карте, пока вы не вернёте другой статус.
                </Text>
              ) : null}
            </View>
          </Card>

          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>Фото</Text>
            <Text style={styles.hint}>
              JPEG, PNG или WebP до 5 МБ. Выберите фото, чтобы извлечь из него характеристики.
            </Text>
            {photos.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.photos}>
                  {photos.map((photo) => {
                    const active = photo.url === selectedUrl;
                    return (
                      <View key={photo.url} style={styles.photoWrap}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          onPress={() => setSelectedUrl(photo.url)}
                          style={[styles.photoFrame, active && styles.photoFrameActive]}
                        >
                          <Image
                            source={{ uri: photo.url }}
                            style={styles.photo}
                            resizeMode="cover"
                          />
                        </Pressable>
                        <Pressable
                          onPress={() => removePhoto(photo.url)}
                          accessibilityRole="button"
                        >
                          <Text style={styles.remove}>Удалить</Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            ) : null}
            <Button
              title={uploading ? 'Загружаем…' : 'Выбрать фото'}
              variant="secondary"
              loading={uploading}
              disabled={busy}
              onPress={() => void handlePickPhotos()}
            />
            <Button
              title={extracting ? 'Извлекаем…' : 'Извлечь характеристики из фото'}
              variant="secondary"
              loading={extracting}
              disabled={busy || !selectedUrl}
              onPress={() => void handleExtract()}
            />
          </Card>

          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>Характеристики</Text>
            {specRows.length === 0 ? (
              <Text style={styles.hint}>
                Заполните вручную или извлеките из фото — список можно править.
              </Text>
            ) : null}
            {specRows.map((row, index) => (
              <View key={index} style={styles.specRow}>
                <View style={styles.flex}>
                  <Input
                    value={row.key}
                    onChangeText={(key) => updateSpecRow(index, { key })}
                    placeholder="Параметр"
                  />
                </View>
                <View style={styles.flex}>
                  <Input
                    value={row.value}
                    onChangeText={(value) => updateSpecRow(index, { value })}
                    placeholder="Значение"
                  />
                </View>
                <Pressable
                  onPress={() => removeSpecRow(index)}
                  accessibilityRole="button"
                  accessibilityLabel="Удалить характеристику"
                  style={styles.specRemove}
                >
                  <Text style={styles.specRemoveText}>×</Text>
                </Pressable>
              </View>
            ))}
            <Button
              title="Добавить характеристику"
              variant="secondary"
              disabled={busy}
              onPress={() => setSpecRows((prev) => [...prev, { key: '', value: '' }])}
            />
          </Card>

          {error ? <ErrorBanner message={error} /> : null}
          <Button
            title={
              initial
                ? submitting
                  ? 'Сохраняем…'
                  : 'Сохранить'
                : submitting
                  ? 'Добавление…'
                  : 'Добавить технику'
            }
            loading={submitting}
            disabled={uploading || extracting}
            onPress={() => void handleSubmit()}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: spacing.lg, paddingBottom: spacing.xl * 2, gap: spacing.lg },
  section: { gap: spacing.md },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  field: { gap: spacing.xs },
  label: { fontSize: 14, fontWeight: '500', color: colors.text },
  hint: { fontSize: 13, color: colors.textMuted },
  rowFields: { flexDirection: 'row', gap: spacing.md },
  textarea: { minHeight: 96, paddingTop: spacing.md, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  chipText: { fontSize: 14, color: colors.text },
  chipTextActive: { color: colors.primaryDark, fontWeight: '600' },
  photos: { flexDirection: 'row', gap: spacing.md },
  photoWrap: { gap: spacing.xs, alignItems: 'center' },
  photoFrame: {
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  photoFrameActive: { borderColor: colors.primary },
  photo: { width: 96, height: 96, backgroundColor: colors.border },
  remove: { fontSize: 13, color: colors.danger },
  specRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  specRemove: {
    width: 36,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  specRemoveText: { fontSize: 22, color: colors.textMuted },
});
