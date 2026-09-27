import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatDate } from '@/lib/format';
import { colors, radius, spacing } from '@/lib/theme';

interface DateFieldProps {
  label: string;
  value: Date;
  onChange: (date: Date) => void;
  minimumDate?: Date;
  error?: string | null;
}

/**
 * Поле выбора даты на нативном пикере: iOS — компактный inline-пикер,
 * Android — системный диалог, открываемый по нажатию на поле.
 */
export function DateField({ label, value, onChange, minimumDate, error }: DateFieldProps) {
  const handleChange = (event: DateTimePickerEvent, date?: Date) => {
    if (event.type === 'set' && date) onChange(date);
  };

  const openAndroid = () => {
    DateTimePickerAndroid.open({
      value,
      mode: 'date',
      minimumDate,
      onChange: handleChange,
    });
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      {Platform.OS === 'ios' ? (
        <View style={[styles.iosField, error ? styles.fieldError : null]}>
          <DateTimePicker
            value={value}
            mode="date"
            display="compact"
            minimumDate={minimumDate}
            onChange={handleChange}
            accentColor={colors.primary}
            locale="ru-RU"
          />
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${formatDate(value)}`}
          onPress={openAndroid}
          style={({ pressed }) => [
            styles.field,
            error ? styles.fieldError : null,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.value}>{formatDate(value)}</Text>
          <Ionicons name="calendar-outline" size={18} color={colors.textMuted} />
        </Pressable>
      )}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: { fontSize: 14, fontWeight: '500', color: colors.text },
  field: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  iosField: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  fieldError: { borderColor: colors.danger },
  pressed: { opacity: 0.85 },
  value: { fontSize: 16, color: colors.text },
  errorText: { color: colors.danger, fontSize: 13 },
});
