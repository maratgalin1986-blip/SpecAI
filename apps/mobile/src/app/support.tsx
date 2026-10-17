import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SupportCard } from '@/components/SupportCard';
import { EmptyState, Loader } from '@/components/ui';
import { useSupport } from '@/lib/support';
import { spacing } from '@/theme';

/** «Поддержать приложение» из профиля: та же карточка, в любой момент. */
export default function SupportScreen() {
  const router = useRouter();
  const support = useSupport();
  if (!support) return <Loader />;
  return (
    <ScrollView contentContainerStyle={styles.container}>
      {support.enabled ? (
        <SupportCard
          support={support}
          closeLabel="Закрыть"
          onClose={() => {
            if (router.canGoBack()) router.back();
          }}
        />
      ) : (
        <EmptyState title="Сейчас поддержка не нужна" description="Спасибо, что заглянули!" />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
});
