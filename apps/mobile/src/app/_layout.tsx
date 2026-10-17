import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Loader } from '@/components/ui';
import { AuthProvider, useAuth } from '@/lib/auth';
import { usePushRegistration } from '@/lib/push';
// Фоновая задача «на линии» регистрируется при старте приложения (и в фоне).
import '@/lib/lineTask';
import { colors } from '@/lib/theme';

function RootNavigator() {
  const { token, isLoading } = useAuth();
  // Push: registers this device after sign-in, forgets it on sign-out.
  usePushRegistration(token);

  if (isLoading) {
    return <Loader />;
  }

  const isSignedIn = Boolean(token);

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '600' },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      {/*
        Точка входа объявлена первой: когда после входа группа (auth) исчезает,
        навигатор открывает первый доступный экран — index разводит по ролям
        (исполнителя — в «Ленту», машиниста — в «Смены»), и главная заказчика
        с картой и запросом геолокации у них не монтируется.
      */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Protected guard={!isSignedIn}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={isSignedIn}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="orders/new" options={{ title: 'Новая заявка' }} />
        <Stack.Screen name="orders/[id]" options={{ title: 'Заявка' }} />
        <Stack.Screen name="orders/[id]/chat" options={{ title: 'Чат' }} />
        <Stack.Screen name="bookings/[id]/review" options={{ title: 'Отзыв' }} />
        <Stack.Screen name="comments" options={{ title: 'Комментарии' }} />
        <Stack.Screen name="provider/documents" options={{ title: 'Документы' }} />
        <Stack.Screen name="demand" options={{ title: 'Карта спроса' }} />
        <Stack.Screen name="become-provider" options={{ title: 'Стать исполнителем' }} />
      </Stack.Protected>
      {/* Доступны и без входа: каталог, карточка техники, карта, звонок, о компании. */}
      <Stack.Screen name="catalog" options={{ title: 'Каталог техники' }} />
      <Stack.Screen name="equipment/[id]" options={{ title: 'Техника' }} />
      <Stack.Screen name="callback" options={{ title: 'Заказать звонок', presentation: 'modal' }} />
      <Stack.Screen name="about" options={{ title: 'О компании' }} />
      <Stack.Screen name="map" options={{ title: 'Карта исполнителей' }} />
      <Stack.Screen name="providers" options={{ title: 'Исполнители' }} />
      <Stack.Screen name="guide" options={{ title: 'Как пользоваться' }} />
      <Stack.Screen name="support" options={{ title: 'Поддержать приложение' }} />
      {/*
        Меню администратора: вход по паролю админки, а не по аккаунту, поэтому
        доступно и без входа (экраны сами просят пароль — AdminGate).
      */}
      <Stack.Screen name="admin/index" options={{ title: 'Меню администратора' }} />
      <Stack.Screen name="admin/stats" options={{ title: 'Сводка' }} />
      <Stack.Screen name="admin/moderation" options={{ title: 'Модерация' }} />
      <Stack.Screen name="admin/orders" options={{ title: 'Заявки из чатов' }} />
      <Stack.Screen name="admin/providers" options={{ title: 'Исполнители' }} />
      <Stack.Screen name="admin/support" options={{ title: 'Поддержка (донаты)' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="dark" />
          <RootNavigator />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
