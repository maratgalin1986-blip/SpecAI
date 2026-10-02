import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ContactActions } from '@/components/ContactActions';
import { Card } from '@/components/ui';
import { SERVICES, SITE } from '@/lib/site';
import { colors, radius, spacing } from '@/lib/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function openSite(path: string) {
  return WebBrowser.openBrowserAsync(`${SITE.url}${path}`);
}

/** «О компании» — контакты и услуги с сайта (apps/web/src/lib/site.ts, главная, /contacts). */
export default function AboutScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'О компании' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.hero}>
          <View style={styles.logo}>
            <Text style={styles.logoText} numberOfLines={1} adjustsFontSizeToFit>
              СП16
            </Text>
          </View>
          <Text style={styles.name}>{SITE.name}</Text>
          <Text style={styles.tagline}>{SITE.tagline}</Text>
          <Text style={styles.region}>
            {SITE.city} · {SITE.region}
          </Text>
        </View>

        <Card style={styles.section}>
          <Text style={styles.description}>{SITE.description}</Text>
          <Text style={styles.description}>
            Экскаваторы-погрузчики, автокраны и погрузчики с опытными операторами — от 2 500 ₽/ч.
            ИИ-агенты круглосуточно подберут технику, посчитают стоимость и оформят заявку.
          </Text>
        </Card>

        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Контакты</Text>
          <ContactRow
            icon="call-outline"
            label="Телефон"
            value={SITE.phone}
            onPress={() => void Linking.openURL(SITE.phoneHref)}
          />
          <ContactRow
            icon="mail-outline"
            label="E-mail"
            value={SITE.email}
            onPress={() => void Linking.openURL(`mailto:${SITE.email}`)}
          />
          <ContactRow
            icon="location-outline"
            label="Регион работы"
            value={`${SITE.city} и ${SITE.region}`}
          />
          <ContactRow
            icon="time-outline"
            label="Режим работы"
            value={`${SITE.workingHours} · ${SITE.agentsHours}`}
          />
          <ContactActions source="mobile:about" />
        </Card>

        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Техника и услуги</Text>
          {SERVICES.map((service) => (
            <View key={service.title} style={styles.service}>
              <Text style={styles.serviceTitle}>{service.title}</Text>
              <Text style={styles.serviceText}>{service.text}</Text>
            </View>
          ))}
        </Card>

        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>На сайте</Text>
          <LinkRow label="Главная страница" onPress={() => void openSite('/')} />
          <LinkRow label="Каталог техники" onPress={() => void openSite('/equipment')} />
          <LinkRow label="ИИ-агенты" onPress={() => void openSite('/agents')} />
          <LinkRow label="Поставщикам" onPress={() => void openSite('/provider')} />
          <LinkRow label="Контакты" onPress={() => void openSite('/contacts')} />
          <LinkRow label="♥ Поддержать проект" onPress={() => void openSite('/support')} />
          <LinkRow label="Политика конфиденциальности" onPress={() => void openSite('/privacy')} />
        </Card>

        <Text style={styles.legal}>
          © {new Date().getFullYear()} {SITE.legalName} · ИНН {SITE.inn} · КПП {SITE.kpp}
        </Text>
      </ScrollView>
    </>
  );
}

function ContactRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: IconName;
  label: string;
  value: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'link' : undefined}
      style={({ pressed }) => [styles.contactRow, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={20} color={colors.primaryDark} />
      <View style={styles.contactBody}>
        <Text style={styles.contactLabel}>{label}</Text>
        <Text style={[styles.contactValue, onPress && styles.contactLink]}>{value}</Text>
      </View>
    </Pressable>
  );
}

function LinkRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
    >
      <Text style={styles.linkText}>{label}</Text>
      <Ionicons name="open-outline" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xl * 2, gap: spacing.lg },
  hero: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.sm },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  logoText: { color: '#fff', fontSize: 20, fontWeight: '800', paddingHorizontal: 4 },
  name: { fontSize: 24, fontWeight: '700', color: colors.text },
  tagline: { fontSize: 15, color: colors.textMuted, textAlign: 'center' },
  region: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primaryDark,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  section: { gap: spacing.md },
  sectionTitle: { fontSize: 17, fontWeight: '600', color: colors.text },
  description: { fontSize: 14, lineHeight: 21, color: colors.textMuted },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  contactBody: { flex: 1 },
  contactLabel: { fontSize: 12, color: colors.textMuted },
  contactValue: { fontSize: 15, fontWeight: '500', color: colors.text },
  contactLink: { color: colors.primaryDark },
  pressed: { opacity: 0.7 },
  service: { gap: 2 },
  serviceTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  serviceText: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    borderRadius: radius.sm,
  },
  linkText: { fontSize: 15, color: colors.text },
  legal: { fontSize: 12, color: colors.textSoft, textAlign: 'center' },
});
