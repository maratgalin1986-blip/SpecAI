import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SITE } from '@/lib/site';
import { colors, radius, spacing } from '@/lib/theme';

/** Открывает звонилку с телефоном компании; если tel: недоступен (эмулятор) — показывает номер. */
export async function callCompany(): Promise<void> {
  try {
    await Linking.openURL(SITE.phoneHref);
  } catch {
    Alert.alert('Позвоните нам', SITE.phone);
  }
}

interface ContactActionsProps {
  /** Откуда заявка — попадает в поле `source` лида. */
  source: string;
  /** Текст, который подставится в комментарий формы. */
  message?: string;
  compact?: boolean;
}

/** Пара кнопок «Позвонить» и «Заказать звонок» — как в шапке и футере сайта. */
export function ContactActions({ source, message, compact }: ContactActionsProps) {
  const router = useRouter();
  return (
    <View style={[styles.row, compact && styles.rowCompact]}>
      <Pressable
        accessibilityRole="button"
        onPress={() => void callCompany()}
        style={({ pressed }) => [styles.button, styles.call, pressed && styles.pressed]}
      >
        <Ionicons name="call-outline" size={18} color="#fff" />
        <Text style={styles.callText}>{compact ? 'Позвонить' : SITE.phone}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push({ pathname: '/callback', params: { source, message } })}
        style={({ pressed }) => [styles.button, styles.callback, pressed && styles.pressed]}
      >
        <Ionicons name="chatbox-ellipses-outline" size={18} color={colors.primaryDark} />
        <Text style={styles.callbackText}>Заказать звонок</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  rowCompact: { gap: spacing.xs },
  button: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + 2,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  call: { backgroundColor: colors.primary },
  callback: {
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.primaryLight,
  },
  pressed: { opacity: 0.85 },
  callText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  callbackText: { color: colors.primaryDark, fontWeight: '600', fontSize: 14 },
});
