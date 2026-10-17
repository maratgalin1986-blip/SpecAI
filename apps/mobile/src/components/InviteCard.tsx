import React from 'react';
import { Alert, Share, StyleSheet, Text, View } from 'react-native';
import { Button, Card } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import {
  CUSTOMER_INVITE_NOTE,
  INVITE_DETAIL,
  INVITE_HEADLINE,
  invitationMessage,
  invitedLine,
  priorityBadgeText,
} from '@/lib/referralBonus';
import { colors, radius, spacing } from '@/theme';

/**
 * «🚀 Заявки приходят вам на 5 минут раньше — до 24 октября»: бонус акции
 * «Пригласи друга» у исполнителя (priorityUntil из GET /api/mobile/me).
 * Ничего не рисует, когда бонуса нет.
 */
export function PriorityBadge() {
  const { user } = useAuth();
  const text = user?.role === 'PROVIDER_ADMIN' ? priorityBadgeText(user.priorityUntil) : null;
  if (!text) return null;
  return (
    <View style={styles.badge} accessibilityRole="text">
      <Text style={styles.badgeText}>{text}</Text>
    </View>
  );
}

/**
 * «Пригласи друга» в профиле: своя ссылка и кнопка «Поделиться». Исполнителю —
 * условия акции; заказчику — обычное приглашение и строка о бонусе, который
 * заработает, когда он подключит свою технику.
 */
export function InviteCard() {
  const { user } = useAuth();
  const link = user?.referralLink;
  if (!user || !link) return null;
  if (user.role !== 'PROVIDER_ADMIN' && user.role !== 'CUSTOMER') return null;
  const provider = user.role === 'PROVIDER_ADMIN';
  const invited = invitedLine(user.invited);

  const share = async () => {
    try {
      await Share.share({ message: invitationMessage(provider ? 'PROVIDER' : 'CUSTOMER', link) });
    } catch {
      Alert.alert('Не получилось поделиться', 'Скопируйте ссылку и отправьте её другу.');
    }
  };

  return (
    <Card style={styles.card}>
      <Text style={styles.eyebrow}>Пригласи друга</Text>
      <Text style={styles.title}>{provider ? INVITE_HEADLINE : 'Знаете, кому нужна техника?'}</Text>
      <Text style={styles.text}>
        {provider
          ? INVITE_DETAIL
          : 'Отправьте ссылку прорабу или знакомому подрядчику: заявки и предложения бесплатны.'}
      </Text>
      {provider ? null : <Text style={styles.note}>{CUSTOMER_INVITE_NOTE}</Text>}
      <PriorityBadge />
      <Text style={styles.link} selectable>
        {link}
      </Text>
      <Button title="Поделиться ссылкой" variant="secondary" onPress={share} />
      {invited ? <Text style={styles.note}>{invited}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primaryDark,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  text: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  note: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  link: {
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  badgeText: { fontSize: 13, fontWeight: '700', color: colors.primaryDark },
});
