import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SITE } from '@/lib/site';
import { markWelcomeSeen, WELCOME_PATHS, type WelcomePath } from '@/lib/welcome';
import { colors, radius, shadow, spacing, TAP, typography } from '@/theme';

const ICONS: Record<WelcomePath['role'], React.ComponentProps<typeof Ionicons>['name']> = {
  customer: 'search-outline',
  provider: 'construct-outline',
};

/**
 * Приветствие перед входом (владелец, 2026-10-17): что здесь можно и что
 * всё бесплатно и без посредников. Две большие карточки ведут в регистрацию с выбранной ролью,
 * ниже — «Уже есть аккаунт? Войти». Выбор запоминается: при следующем запуске
 * сразу вход, а сюда — со входа, «Как это работает».
 */
export default function WelcomeScreen() {
  const router = useRouter();

  const choose = (path: WelcomePath) => {
    markWelcomeSeen();
    router.push({ pathname: '/(auth)/register', params: { role: path.role } });
  };

  const signIn = () => {
    markWelcomeSeen();
    if (router.canGoBack()) router.back();
    else router.replace('/(auth)/login');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.brand}>{SITE.name}</Text>
          <Text style={styles.byline}>{SITE.byline}</Text>
          <Text style={styles.title}>Здравствуйте! Что вам нужно?</Text>
          {/* Обещание площадки (владелец, 2026-10-17): заголовок — в карточках
              ниже, здесь — что оно значит. */}
          <Text style={styles.promise}>{SITE.promise} — и заказчикам, и исполнителям</Text>
          <Text style={styles.subtitle}>{SITE.promiseDetail}</Text>
        </View>

        {WELCOME_PATHS.map((path) => (
          <Pressable
            key={path.role}
            accessibilityRole="button"
            accessibilityLabel={`${path.title}. ${path.text}`}
            onPress={() => choose(path)}
            style={({ pressed }) => [
              styles.card,
              path.role === 'provider' && styles.cardDark,
              pressed && styles.pressed,
            ]}
          >
            <View style={[styles.icon, path.role === 'provider' && styles.iconDark]}>
              <Ionicons
                name={ICONS[path.role]}
                size={26}
                color={path.role === 'provider' ? colors.onPrimary : colors.primaryDark}
              />
            </View>
            <View style={styles.cardBody}>
              <Text style={[styles.cardTitle, path.role === 'provider' && styles.onDark]}>
                {path.title}
              </Text>
              <Text style={[styles.cardText, path.role === 'provider' && styles.onDarkMuted]}>
                {path.text}
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={22}
              color={path.role === 'provider' ? colors.onDark : colors.textMuted}
            />
          </Pressable>
        ))}

        <Pressable
          accessibilityRole="link"
          onPress={signIn}
          style={({ pressed }) => [styles.signIn, pressed && styles.pressed]}
        >
          <Text style={styles.signInText}>
            Уже есть аккаунт? <Text style={styles.signInStrong}>Войти</Text>
          </Text>
        </Pressable>

        <Link href="/catalog" style={styles.browse}>
          Сначала посмотреть технику
        </Link>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: { alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  brand: { ...typography.title, color: colors.primaryDark },
  byline: { fontSize: 13, color: colors.textMuted },
  title: { ...typography.heading, color: colors.text, textAlign: 'center', marginTop: spacing.sm },
  promise: { ...typography.caption, color: colors.success, textAlign: 'center' },
  subtitle: { ...typography.small, color: colors.textMuted, textAlign: 'center' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 96,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    ...shadow.card,
  },
  cardDark: { backgroundColor: colors.dark, borderColor: colors.dark },
  pressed: { opacity: 0.85 },
  icon: {
    width: TAP,
    height: TAP,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
  },
  iconDark: { backgroundColor: colors.primary },
  cardBody: { flex: 1, gap: spacing.xs },
  cardTitle: { ...typography.heading, color: colors.text },
  cardText: { ...typography.small, color: colors.textMuted },
  onDark: { color: colors.onDark },
  onDarkMuted: { color: colors.onDarkMuted },
  signIn: { minHeight: TAP, alignItems: 'center', justifyContent: 'center' },
  signInText: { fontSize: 15, color: colors.textMuted },
  signInStrong: { color: colors.primaryDark, fontWeight: '700' },
  browse: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
});
