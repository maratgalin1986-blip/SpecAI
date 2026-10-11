import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, radius, spacing } from '@/theme';

/** Красная метка «Просрочены документы» на карточке машины; ведёт к её документам. */
export function EquipmentDocBadge({
  equipmentId,
  expired,
}: {
  equipmentId: string;
  expired: number;
}) {
  const router = useRouter();
  if (expired <= 0) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Просрочены документы: ${expired}. Открыть документы машины`}
      onPress={() => router.push({ pathname: '/provider/documents', params: { equipmentId } })}
      style={({ pressed }) => [styles.badge, pressed && styles.pressed]}
    >
      <Ionicons name="alert-circle" size={14} color={colors.danger} />
      <Text style={styles.text}>Просрочены документы: {expired}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.dangerLight,
  },
  pressed: { opacity: 0.85 },
  text: { fontSize: 12, fontWeight: '700', color: colors.danger },
});
