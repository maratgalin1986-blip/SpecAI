import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { Link } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Button, Card, ErrorBanner, Input } from '@/components/ui';
import {
  ApiError,
  fetchMyCompanyPin,
  updateMyCompanyPin,
  uploadFile,
  type CompanyPin,
} from '@/lib/api';
import { phoneNear } from '@/lib/phoneNear';
import { mapSwitchOn } from '@/lib/providersMap';
import { colors, radius, spacing } from '@/lib/theme';

/** Как PIN_NOTE_MAX и PIN_NOTE_EXAMPLES в apps/web/src/lib/providerMap.ts. */
const NOTE_MAX = 120;
const NOTE_EXAMPLES = [
  'от 2 500 ₽/ч, скидка 10% от недели',
  'Работаем без выходных, подача за 2 часа',
  'Подача по городу бесплатно',
];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type MapSwitch = 'showOnMap' | 'showPhoneOnMap';

/**
 * «Моя точка на карте» в кабинете поставщика: адрес базы (сайт находит его
 * на карте), значок — стандартный или фото своей техники, и подпись для
 * заказчиков. Сохраняется через PATCH /api/companies/me. Два переключателя
 * «все видят всех» (владелец, 2026-11-08) сохраняются сразу: «Показывать
 * меня на карте» — единственный способ уйти с карты, «Показывать телефон на
 * карте» — номер в карточке точки; оба включены, пока исполнитель не выключит.
 */
export function MyMapPinCard() {
  const [company, setCompany] = useState<CompanyPin | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploadsEnabled, setUploadsEnabled] = useState(false);
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [switching, setSwitching] = useState<MapSwitch | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await fetchMyCompanyPin();
      setCompany(data.company);
      setPhotos(
        data.company.pinImageUrl && !data.photos.includes(data.company.pinImageUrl)
          ? [data.company.pinImageUrl, ...data.photos]
          : data.photos,
      );
      setUploadsEnabled(data.uploadsEnabled);
      setAddress(data.company.baseAddress ?? '');
      setNote(data.company.pinNote ?? '');
      setImage(data.company.pinImageUrl);
    } catch (caught) {
      setLoadError(caught instanceof ApiError ? caught.message : 'Не удалось загрузить точку');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pickPhoto = async () => {
    setMessage(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setMessage({ ok: false, text: 'Нет доступа к фото. Разрешите доступ в настройках.' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    if (asset.fileSize && asset.fileSize > MAX_IMAGE_BYTES) {
      setMessage({ ok: false, text: 'Фото больше 5 МБ — выберите другое' });
      return;
    }
    const type = asset.mimeType ?? 'image/jpeg';
    setUploading(true);
    try {
      const file = await uploadFile({
        uri: asset.uri,
        name: asset.fileName ?? `pin-${Date.now()}.${type.split('/')[1] ?? 'jpg'}`,
        type,
      });
      setPhotos((prev) => [file.url, ...prev.filter((url) => url !== file.url)]);
      setImage(file.url);
    } catch (caught) {
      setMessage({
        ok: false,
        text: caught instanceof ApiError ? caught.message : 'Не удалось загрузить фото',
      });
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!company) return;
    setSaving(true);
    setMessage(null);
    try {
      const trimmed = address.trim();
      const { company: saved } = await updateMyCompanyPin({
        // Адрес отправляем, только если он изменился: сервер найдёт его на карте.
        ...(trimmed !== (company.baseAddress ?? '') || company.baseLat === null
          ? { baseAddress: trimmed, near: await phoneNear() }
          : {}),
        pinImageUrl: image,
        pinNote: note,
      });
      setCompany(saved);
      setAddress(saved.baseAddress ?? '');
      setNote(saved.pinNote ?? '');
      setMessage({ ok: true, text: 'Сохранено — так вас видят заказчики на карте' });
    } catch (caught) {
      setMessage({
        ok: false,
        text: caught instanceof ApiError ? caught.message : 'Не удалось сохранить',
      });
    } finally {
      setSaving(false);
    }
  };

  // Переключатель сохраняется сам, без «Сохранить»; при ошибке возвращается назад.
  const toggle = async (key: MapSwitch, value: boolean) => {
    if (!company || switching) return;
    const before = company[key];
    setSwitching(key);
    setSwitchError(null);
    setCompany({ ...company, [key]: value });
    try {
      const { company: saved } = await updateMyCompanyPin({ [key]: value });
      // Остальные поля формы могли быть изменены и ещё не сохранены — их не трогаем.
      setCompany((current) => (current ? { ...current, [key]: saved[key] ?? value } : current));
    } catch (caught) {
      setCompany((current) => (current ? { ...current, [key]: before } : current));
      setSwitchError(caught instanceof ApiError ? caught.message : 'Не удалось сохранить');
    } finally {
      setSwitching(null);
    }
  };

  if (loadError) return <ErrorBanner message={loadError} onRetry={() => void load()} />;
  if (!company) return null;

  return (
    <Card style={styles.card}>
      <View style={styles.titleRow}>
        <Ionicons name="location-outline" size={20} color={colors.primaryDark} />
        <Text style={styles.title}>Моя точка на карте</Text>
      </View>
      <Text style={styles.hint}>
        {company.baseLat === null
          ? 'Вас пока нет на карте — укажите адрес, где стоит техника.'
          : 'По ней заказчики находят ближайшего исполнителя. Адрес и e-mail на карте не видны.'}
      </Text>

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Показывать меня на карте</Text>
        <Switch
          value={mapSwitchOn(company.showOnMap)}
          disabled={switching !== null}
          accessibilityLabel="Показывать меня на карте"
          onValueChange={(value) => void toggle('showOnMap', value)}
          trackColor={{ true: colors.primary }}
        />
      </View>
      <Text style={styles.hint}>
        {mapSwitchOn(company.showOnMap)
          ? 'Вас видят всегда, и когда вы не на линии — тогда значок приглушён.'
          : 'Вас нет на карте и телефона нет на вашей странице. Заявки в ленте приходят как раньше.'}
      </Text>
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Показывать телефон на карте</Text>
        <Switch
          value={mapSwitchOn(company.showPhoneOnMap)}
          disabled={switching !== null || !mapSwitchOn(company.showOnMap)}
          accessibilityLabel="Показывать телефон на карте"
          onValueChange={(value) => void toggle('showPhoneOnMap', value)}
          trackColor={{ true: colors.primary }}
        />
      </View>
      <Text style={styles.hint}>
        {mapSwitchOn(company.showPhoneOnMap)
          ? 'Телефон компании виден в карточке вашей точки — заказчик звонит сразу.'
          : 'Телефон скрыт: в карточке кнопка «Написать», заказчик оставляет заявку.'}
      </Text>
      {switchError ? <Text style={styles.switchError}>{switchError}</Text> : null}

      <Input
        label="Адрес базы"
        value={address}
        onChangeText={setAddress}
        placeholder="Набережные Челны, Мензелинский тракт, 24"
        maxLength={200}
      />

      <Text style={styles.label}>Значок</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.photos}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Стандартный значок"
            accessibilityState={{ selected: image === null }}
            onPress={() => setImage(null)}
            style={[styles.photo, styles.standard, image === null && styles.selected]}
          >
            <Ionicons name="construct" size={26} color={colors.accent} />
          </Pressable>
          {photos.map((url) => (
            <Pressable
              key={url}
              accessibilityRole="button"
              accessibilityLabel="Фото техники"
              accessibilityState={{ selected: image === url }}
              onPress={() => setImage(url)}
              style={[styles.photo, image === url && styles.selected]}
            >
              <Image source={{ uri: url }} style={styles.photoImage} />
            </Pressable>
          ))}
          {uploadsEnabled ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Загрузить новое фото"
              onPress={() => void pickPhoto()}
              disabled={uploading}
              style={[styles.photo, styles.add]}
            >
              <Ionicons
                name={uploading ? 'hourglass-outline' : 'add'}
                size={26}
                color={colors.textMuted}
              />
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
      {photos.length === 0 && !uploadsEnabled ? (
        <Text style={styles.hint}>
          Добавьте фото к своей технике — и его можно будет выбрать для значка.
        </Text>
      ) : null}

      <Input
        label={`Подпись (${note.length}/${NOTE_MAX})`}
        value={note}
        onChangeText={(text) => setNote(text.slice(0, NOTE_MAX))}
        placeholder="Цена, скидки, режим работы"
        maxLength={NOTE_MAX}
      />
      <Text style={styles.hint}>Без телефона и e-mail — заказчики пишут через заявку.</Text>
      <View style={styles.examples}>
        {NOTE_EXAMPLES.map((example) => (
          <Pressable
            key={example}
            accessibilityRole="button"
            onPress={() => setNote(example)}
            style={styles.example}
          >
            <Text style={styles.exampleText}>{example}</Text>
          </Pressable>
        ))}
      </View>

      {message ? (
        <Text style={[styles.message, { color: message.ok ? colors.success : colors.danger }]}>
          {message.text}
        </Text>
      ) : null}
      <View style={styles.buttons}>
        <View style={styles.button}>
          <Button title="Сохранить" loading={saving} onPress={() => void save()} />
        </View>
        <View style={styles.button}>
          <Link href="/map" asChild>
            <Button title="Открыть карту" variant="secondary" />
          </Link>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  hint: { fontSize: 13, color: colors.textMuted },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
  },
  switchLabel: { flex: 1, fontSize: 15, fontWeight: '500', color: colors.text, paddingRight: 8 },
  switchError: { fontSize: 14, color: colors.danger },
  label: { fontSize: 14, fontWeight: '500', color: colors.text, marginTop: spacing.xs },
  photos: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.xs },
  photo: {
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoImage: { width: '100%', height: '100%' },
  standard: { backgroundColor: colors.dark },
  add: { borderStyle: 'dashed', backgroundColor: colors.card },
  selected: { borderColor: colors.primary, borderWidth: 3 },
  examples: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  example: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
  },
  exampleText: { fontSize: 12, color: colors.text },
  message: { fontSize: 14 },
  buttons: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  button: { flex: 1 },
});
