import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Segmented } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { MODE_OPTIONS, modeHome, showsModePill } from '@/lib/modes';
import { setAppMode, usePrefs, type AppMode } from '@/lib/prefs';
import { colors, radius, shadow, spacing, TAP } from '@/theme';

/**
 * Сменить режим и открыть его первый экран. Внутри вкладок — переход на
 * вкладку; с экрана поверх вкладок (`fromStack`: справка, «Стать
 * исполнителем») — возврат к вкладкам, без второй копии их в истории.
 */
export function useSwitchMode({ fromStack = false }: { fromStack?: boolean } = {}) {
  const router = useRouter();
  return (next: AppMode) => {
    setAppMode(next);
    if (fromStack) router.dismissTo(modeHome(next));
    else router.navigate(modeHome(next));
  };
}

/**
 * «Заказчик | Исполнитель» в одно касание — на главной и в ленте исполнителя.
 * Заказчику и машинисту не показывается (см. lib/modes.ts).
 */
export function ModeSwitch({ style }: { style?: StyleProp<ViewStyle> }) {
  const { user } = useAuth();
  const { loaded, mode } = usePrefs();
  const switchMode = useSwitchMode();
  if (!showsModePill(user?.role) || !loaded) return null;
  return (
    <View style={[styles.wrap, style]}>
      <Segmented
        options={MODE_OPTIONS}
        value={mode}
        onChange={(next) => {
          if (next !== mode) switchMode(next);
        }}
      />
    </View>
  );
}

/** Круглая кнопка «?» — открывает «Как пользоваться». */
export function HelpButton({ plain = false }: { plain?: boolean }) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Как пользоваться"
      onPress={() => router.push('/guide')}
      hitSlop={6}
      style={({ pressed }) => [plain ? styles.plain : styles.round, pressed && styles.pressed]}
    >
      <Ionicons name="help" size={22} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.card,
    borderRadius: radius.md + 2,
    padding: 2,
    ...shadow.card,
  },
  round: {
    width: TAP,
    height: TAP,
    borderRadius: TAP / 2,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  plain: {
    width: 40,
    height: 40,
    marginRight: spacing.sm,
    borderRadius: 20,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.85 },
});
