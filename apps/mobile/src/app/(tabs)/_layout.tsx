import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import React from 'react';
import type { ColorValue } from 'react-native';
import { useAuth } from '@/lib/auth';
import { SITE } from '@/lib/site';
import { colors } from '@/lib/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function tabIcon(name: IconName) {
  return ({ color, size }: { color: ColorValue; size: number }) => (
    <Ionicons name={name} color={color} size={size} />
  );
}

export default function TabsLayout() {
  const { user } = useAuth();
  const isProvider = user?.role === 'PROVIDER_ADMIN';

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '600' },
        headerShadowVisible: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Каталог',
          headerTitle: `${SITE.name} · Каталог`,
          tabBarIcon: tabIcon('construct-outline'),
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{ title: 'Бронирования', tabBarIcon: tabIcon('calendar-outline') }}
      />
      <Tabs.Screen
        name="orders"
        options={{ title: 'Заявки', tabBarIcon: tabIcon('document-text-outline') }}
      />
      <Tabs.Screen
        name="provider"
        options={{
          title: 'Кабинет',
          tabBarIcon: tabIcon('briefcase-outline'),
          // href: null скрывает вкладку у клиентов и администраторов.
          href: isProvider ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{ title: 'Ассистент', tabBarIcon: tabIcon('chatbubble-ellipses-outline') }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Профиль', tabBarIcon: tabIcon('person-circle-outline') }}
      />
    </Tabs>
  );
}
