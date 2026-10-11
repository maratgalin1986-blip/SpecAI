import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { colors, radius, shadow, spacing, TAP, typography } from '@/theme';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'dark' | 'ghost';

interface ButtonProps extends Omit<PressableProps, 'style'> {
  title: string;
  variant?: ButtonVariant;
  /** «large» — главная кнопка экрана (56 dp), как «Заказать». */
  size?: 'regular' | 'large';
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

const BUTTON_TEXT_COLOR: Record<ButtonVariant, string> = {
  primary: colors.onPrimary,
  secondary: colors.text,
  danger: colors.danger,
  dark: colors.onDark,
  ghost: colors.primaryDark,
};

export function Button({
  title,
  variant = 'primary',
  size = 'regular',
  loading,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: Boolean(isDisabled), busy: Boolean(loading) }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        size === 'large' && styles.buttonLarge,
        styles[`button_${variant}`],
        pressed && styles.buttonPressed,
        isDisabled && styles.buttonDisabled,
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={BUTTON_TEXT_COLOR[variant]} />
      ) : (
        <Text
          style={[
            styles.buttonText,
            size === 'large' && styles.buttonTextLarge,
            { color: BUTTON_TEXT_COLOR[variant] },
          ]}
          numberOfLines={2}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

interface InputProps extends TextInputProps {
  label?: string;
  error?: string | null;
}

export function Input({ label, error, style, ...rest }: InputProps) {
  return (
    <View style={styles.inputWrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.textSoft}
        accessibilityLabel={rest.accessibilityLabel ?? label ?? rest.placeholder}
        style={[styles.input, error ? styles.inputError : null, style]}
        {...rest}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

export function Card({ style, children, ...rest }: ViewProps) {
  return (
    <View style={[styles.card, style]} {...rest}>
      {children}
    </View>
  );
}

export function Badge({ text, tone = 'neutral' }: { text: string; tone?: BadgeTone }) {
  const palette = BADGE_TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }]}>
      <Text style={[styles.badgeText, { color: palette.fg }]}>{text}</Text>
    </View>
  );
}

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'info' | 'danger' | 'dark' | 'accent';

const BADGE_TONES: Record<BadgeTone, { bg: string; fg: string }> = {
  neutral: { bg: colors.surfaceMuted, fg: colors.darkSoft },
  success: { bg: colors.successLight, fg: colors.success },
  warning: { bg: colors.warningLight, fg: colors.warningText },
  info: { bg: colors.infoLight, fg: colors.info },
  danger: { bg: colors.dangerLight, fg: colors.danger },
  dark: { bg: colors.dark, fg: colors.onDark },
  accent: { bg: colors.primaryLight, fg: colors.primaryDark },
};

/** Выбираемая «таблетка»: категория, статус машины, вариант ответа. */
export function Chip({
  label,
  selected = false,
  onPress,
  disabled,
  accessibilityLabel,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected, disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && styles.buttonPressed,
      ]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Переключатель из 2–3 сегментов («Нужна сейчас / На дату», «Брони / Предложения»). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  dark = false,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  dark?: boolean;
}) {
  return (
    <View style={[styles.segmented, dark && styles.segmentedDark]} accessibilityRole="tablist">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            style={[
              styles.segment,
              active && (dark ? styles.segmentActiveDark : styles.segmentActive),
            ]}
          >
            <Text
              style={[
                styles.segmentText,
                dark && styles.segmentTextDark,
                active && (dark ? styles.segmentTextActiveDark : styles.segmentTextActive),
              ]}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SectionTitle({ children, action }: { children: string; action?: React.ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {children}
      </Text>
      {action}
    </View>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {description ? <Text style={styles.emptyDescription}>{description}</Text> : null}
    </View>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.errorBanner} accessibilityRole="alert">
      <Text style={styles.errorBannerText}>{message}</Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Повторить"
          hitSlop={8}
          style={styles.errorBannerRetryWrap}
        >
          <Text style={styles.errorBannerRetry}>Повторить</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Loader() {
  return (
    <View style={styles.loader}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: TAP,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  buttonLarge: { minHeight: 56, borderRadius: radius.lg },
  button_primary: { backgroundColor: colors.primary },
  button_secondary: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  button_danger: { backgroundColor: colors.dangerLight },
  button_dark: { backgroundColor: colors.dark },
  button_ghost: { backgroundColor: 'transparent' },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  buttonTextLarge: { fontSize: 18 },
  inputWrap: { gap: spacing.xs },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  input: {
    minHeight: TAP,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.card,
  },
  inputError: { borderColor: colors.danger },
  errorText: { color: colors.danger, fontSize: 13 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadow.card,
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 12, fontWeight: '700' },
  chip: {
    minHeight: 40,
    maxWidth: '100%',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
  },
  chipSelected: { backgroundColor: colors.dark, borderColor: colors.dark },
  chipText: { fontSize: 14, color: colors.text, fontWeight: '500' },
  chipTextSelected: { color: colors.onDark, fontWeight: '700' },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: 3,
  },
  segmentedDark: { backgroundColor: colors.darkSoft },
  segment: {
    flex: 1,
    minHeight: 42,
    borderRadius: radius.sm + 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  segmentActive: { backgroundColor: colors.card, ...shadow.card },
  segmentActiveDark: { backgroundColor: colors.primary },
  segmentText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  segmentTextDark: { color: colors.onDarkMuted },
  segmentTextActive: { color: colors.text, fontWeight: '700' },
  segmentTextActiveDark: { color: colors.onPrimary, fontWeight: '700' },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  sectionTitle: { ...typography.heading, color: colors.text, flexShrink: 1 },
  empty: { alignItems: 'center', padding: spacing.xl, gap: spacing.sm },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.text, textAlign: 'center' },
  emptyDescription: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  errorBanner: {
    backgroundColor: colors.dangerLight,
    borderRadius: radius.md,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  errorBannerText: { color: colors.danger, flex: 1, fontSize: 14 },
  errorBannerRetryWrap: { minHeight: 32, justifyContent: 'center' },
  errorBannerRetry: { color: colors.danger, fontWeight: '700' },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
});
