import { Stack, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { CommentsSection } from '@/components/CommentsSection';
import { ErrorBanner } from '@/components/ui';
import { colors, spacing } from '@/lib/theme';

/**
 * Комментарии об исполнителе (`companyId`) или о заказчике (`userId`):
 * открывается из брони или заявки. `name` — подпись в заголовке.
 */
export default function CommentsScreen() {
  const { companyId, userId, name } = useLocalSearchParams<{
    companyId?: string;
    userId?: string;
    name?: string;
  }>();

  if (!companyId && !userId) {
    return (
      <View style={styles.container}>
        <ErrorBanner message="Не указано, о ком комментарий" />
      </View>
    );
  }

  const aboutCompany = Boolean(companyId);
  return (
    <>
      <Stack.Screen options={{ title: aboutCompany ? 'Об исполнителе' : 'О заказчике' }} />
      <ScrollView contentContainerStyle={styles.container}>
        {name ? <Text style={styles.name}>{name}</Text> : null}
        <CommentsSection
          target={companyId ? { companyId } : { userId: userId as string }}
          title={aboutCompany ? 'Комментарии заказчиков' : 'Комментарии исполнителей'}
          formLabel={aboutCompany ? 'Комментарий об исполнителе' : 'Комментарий о заказчике'}
        />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md },
  name: { fontSize: 18, fontWeight: '700', color: colors.text },
});
