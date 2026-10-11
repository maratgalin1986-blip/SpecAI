import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useState } from 'react';
import { Alert, Image, Linking, StyleSheet, Text, View } from 'react-native';
import { TimesheetCard } from '@/components/TimesheetCard';
import { Badge, Button, Input } from '@/components/ui';
import {
  ApiError,
  imageUri,
  transitionShift,
  uploadFile,
  type Shift,
  type ShiftRole,
  type ShiftStatus,
} from '@/lib/api';
import {
  SHIFT_ACTION_LABELS,
  formatMinutes,
  formatTime,
  liveMinutes,
  shiftTone,
  shortDay,
  transitionWantsPhoto,
} from '@/lib/shifts';
import { colors, radius, spacing, TAP, typography } from '@/theme';

const TICK_MS = 30_000;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

function mimeOf(asset: ImagePicker.ImagePickerAsset): string {
  if (asset.mimeType) return asset.mimeType;
  const ext = asset.uri.split('?')[0]?.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

/**
 * Фото смены: камера или галерея → /api/uploads. null — пользователь отказался
 * от фото; бросает ApiError/Error, если загрузка не удалась.
 */
export async function pickShiftPhoto(source: 'camera' | 'library'): Promise<string | null> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error(
      source === 'camera'
        ? 'Нет доступа к камере. Разрешите его в настройках телефона.'
        : 'Нет доступа к фото. Разрешите его в настройках телефона.',
    );
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 0.7,
    allowsMultipleSelection: false,
  };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  if (asset.fileSize && asset.fileSize > MAX_PHOTO_BYTES) {
    throw new Error('Фото больше 5 МБ — сделайте снимок ещё раз');
  }
  const type = mimeOf(asset);
  const name = asset.fileName ?? `shift-${Date.now()}.${type.split('/')[1] ?? 'jpg'}`;
  const file = await uploadFile({ uri: asset.uri, name, type });
  return file.url;
}

function useTimer(shift: Shift) {
  const [loadedAt, setLoadedAt] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setLoadedAt(Date.now());
    setNow(Date.now());
  }, [shift.id, shift.status, shift.workedMinutes, shift.idleMinutes]);
  useEffect(() => {
    if (shift.status !== 'WORKING' && shift.status !== 'IDLE') return undefined;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [shift.status]);
  return liveMinutes(shift, loadedAt, now);
}

/** Хронология смены: время — статус — причина/фото. */
export function ShiftTimeline({ shift }: { shift: Shift }) {
  if (shift.events.length === 0) return null;
  return (
    <View style={styles.timeline}>
      {shift.events.map((event) => (
        <View key={event.id} style={styles.event}>
          <Text style={styles.eventTime}>{formatTime(event.at)}</Text>
          <View style={styles.flex}>
            <Text style={styles.eventLabel}>{event.label}</Text>
            {event.note ? <Text style={styles.eventNote}>{event.note}</Text> : null}
          </View>
          {event.photoUrl ? (
            <Text style={styles.photoLink} onPress={() => void Linking.openURL(event.photoUrl!)}>
              фото
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

/** Фото в начале и в конце смены. */
export function ShiftPhotos({ shift }: { shift: Shift }) {
  const start = imageUri(shift.startPhotoUrl);
  const end = imageUri(shift.endPhotoUrl);
  if (!start && !end) return null;
  return (
    <View style={styles.photos}>
      {start ? (
        <View style={styles.photoBox}>
          <Image
            source={{ uri: start }}
            style={styles.photo}
            accessibilityLabel="Фото в начале смены"
          />
          <Text style={styles.photoCaption}>Начало</Text>
        </View>
      ) : null}
      {end ? (
        <View style={styles.photoBox}>
          <Image
            source={{ uri: end }}
            style={styles.photo}
            accessibilityLabel="Фото в конце смены"
          />
          <Text style={styles.photoCaption}>Конец</Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Карточка смены для машиниста (и администратора компании): статус с
 * таймером, кнопки «Выехал → На объекте → Работа ⇄ Простой → Завершить
 * смену», фото в начале и в конце, хронология, табель после завершения.
 */
export function ShiftControls({
  shift,
  role,
  onChanged,
}: {
  shift: Shift;
  role: ShiftRole;
  onChanged: (shift: Shift) => void;
}) {
  const timer = useTimer(shift);
  const [pending, setPending] = useState<ShiftStatus | null>(null);
  const [idleReason, setIdleReason] = useState('');
  const [askingIdle, setAskingIdle] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canDrive = role === 'operator' || role === 'provider';

  const send = async (status: ShiftStatus, note?: string, photoUrl?: string) => {
    setPending(status);
    setError(null);
    try {
      const result = await transitionShift(shift.id, { status, note, photoUrl });
      setAskingIdle(false);
      setIdleReason('');
      onChanged(result.shift);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось изменить статус');
    } finally {
      setPending(null);
    }
  };

  const withPhoto = (status: ShiftStatus, note?: string) => {
    const go = async (source: 'camera' | 'library' | null) => {
      if (!source) {
        await send(status, note);
        return;
      }
      setPending(status);
      setError(null);
      try {
        const url = await pickShiftPhoto(source);
        if (url === null) {
          setPending(null);
          return;
        }
        await send(status, note, url);
      } catch (caught) {
        setPending(null);
        setError(caught instanceof Error ? caught.message : 'Не удалось загрузить фото');
      }
    };
    Alert.alert(
      status === 'FINISHED' ? 'Фото в конце смены' : 'Фото в начале смены',
      'Снимок техники на объекте защищает и вас, и заказчика.',
      [
        { text: 'Сделать фото', onPress: () => void go('camera') },
        { text: 'Из галереи', onPress: () => void go('library') },
        { text: 'Без фото', style: 'cancel', onPress: () => void go(null) },
      ],
    );
  };

  const choose = (status: ShiftStatus) => {
    if (status === 'IDLE') {
      setAskingIdle(true);
      return;
    }
    if (transitionWantsPhoto(shift, status)) {
      withPhoto(status);
      return;
    }
    void send(status);
  };

  const confirmIdle = () => {
    if (!idleReason.trim()) {
      setError('Укажите причину простоя');
      return;
    }
    void send('IDLE', idleReason.trim());
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.date}>Смена {shortDay(shift.date)}</Text>
        <Badge text={shift.statusLabel} tone={shiftTone(shift.status)} />
      </View>
      <View style={styles.timer}>
        <View style={styles.timerCell}>
          <Ionicons name="time-outline" size={18} color={colors.success} />
          <Text style={styles.timerValue}>{formatMinutes(timer.worked)}</Text>
          <Text style={styles.timerLabel}>работа</Text>
        </View>
        <View style={styles.timerCell}>
          <Ionicons name="pause-circle-outline" size={18} color={colors.warningText} />
          <Text style={styles.timerValue}>{formatMinutes(timer.idle)}</Text>
          <Text style={styles.timerLabel}>простой</Text>
        </View>
      </View>
      <ShiftTimeline shift={shift} />
      <ShiftPhotos shift={shift} />
      {canDrive && askingIdle ? (
        <View style={styles.idle}>
          <Input
            label="Причина простоя"
            value={idleReason}
            onChangeText={setIdleReason}
            placeholder="Ждём самосвал, нет доступа на объект…"
            maxLength={500}
            autoFocus
          />
          <View style={styles.actions}>
            <View style={styles.flex}>
              <Button
                title="Отметить простой"
                variant="dark"
                loading={pending === 'IDLE'}
                onPress={confirmIdle}
              />
            </View>
            <View style={styles.flex}>
              <Button title="Отмена" variant="ghost" onPress={() => setAskingIdle(false)} />
            </View>
          </View>
        </View>
      ) : canDrive && shift.next.length > 0 ? (
        <View style={styles.actions}>
          {shift.next.map((status) => (
            <View key={status} style={styles.flex}>
              <Button
                title={SHIFT_ACTION_LABELS[status]}
                size={status === 'FINISHED' || status === 'WORKING' ? 'large' : 'regular'}
                variant={
                  status === 'FINISHED' ? 'dark' : status === 'IDLE' ? 'secondary' : 'primary'
                }
                loading={pending === status}
                disabled={pending !== null}
                onPress={() => choose(status)}
              />
            </View>
          ))}
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TimesheetCard shift={shift} role={role} onChanged={onChanged} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  date: { ...typography.heading, color: colors.text },
  timer: { flexDirection: 'row', gap: spacing.sm },
  timerCell: {
    flex: 1,
    minHeight: TAP,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  timerValue: { fontSize: 16, fontWeight: '800', color: colors.text },
  timerLabel: { fontSize: 12, color: colors.textMuted },
  timeline: { gap: spacing.xs },
  event: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  eventTime: { width: 44, fontSize: 13, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  eventLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  eventNote: { fontSize: 13, color: colors.textMuted },
  photoLink: { fontSize: 13, fontWeight: '600', color: colors.primaryDark },
  photos: { flexDirection: 'row', gap: spacing.sm },
  photoBox: { gap: 2 },
  photo: { width: 88, height: 88, borderRadius: radius.md, backgroundColor: colors.border },
  photoCaption: { fontSize: 11, color: colors.textMuted, textAlign: 'center' },
  idle: { gap: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  error: { fontSize: 13, color: colors.danger },
});
