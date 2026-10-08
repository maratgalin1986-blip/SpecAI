import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError, revealOrderPhone, type Order } from '@/lib/api';
import { phoneToHref } from '@/lib/format';
import { colors, radius, spacing, TAP } from '@/theme';

/**
 * Телефон автора заявки из чата или с сайта без входа: показан в маске
 * («+7 917 •••-••-67»), «Показать телефон» открывает его через
 * POST /api/orders/[id]/phone — показ записывается, лимит в сутки на компанию.
 */
export function OrderContact({ order }: { order: Pick<Order, 'id' | 'chatContact'> }) {
  const contact = order.chatContact;
  const [phone, setPhone] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!contact?.canReveal) return null;

  const reveal = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await revealOrderPhone(order.id);
      setPhone(result.phone);
      setName(result.name);
      setNote(result.note ?? null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось открыть телефон');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.box}>
      <View style={styles.row}>
        <Ionicons name="call-outline" size={18} color={colors.primaryDark} />
        {phone ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Позвонить ${phone}`}
            onPress={() => void Linking.openURL(phoneToHref(phone))}
            style={styles.flex}
          >
            <Text style={styles.phone}>
              {name ? `${name}: ` : ''}
              {phone}
            </Text>
          </Pressable>
        ) : (
          <Text style={[styles.masked, styles.flex]}>{contact.maskedPhone ?? 'Телефон скрыт'}</Text>
        )}
        {!phone ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => void reveal()}
            disabled={loading}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          >
            <Text style={styles.buttonText}>{loading ? 'Открываем…' : 'Показать телефон'}</Text>
          </Pressable>
        ) : null}
      </View>
      {note ? <Text style={styles.note}>{note}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!phone && !error ? (
        <Text style={styles.note}>Заявка без аккаунта: каждый показ телефона записывается.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  box: {
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.infoLight,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  masked: { fontSize: 15, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  phone: { fontSize: 16, fontWeight: '800', color: colors.primaryDark },
  button: {
    minHeight: TAP - 8,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.dark,
    justifyContent: 'center',
  },
  buttonText: { color: colors.onDark, fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.85 },
  note: { fontSize: 12, color: colors.textMuted },
  error: { fontSize: 13, color: colors.danger },
});
