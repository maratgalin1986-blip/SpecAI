import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import React from 'react';
import type { ColorValue } from 'react-native';
import { useAuth } from '@/lib/auth';
import { isProviderMode, usePrefs } from '@/lib/prefs';
import { useUnreadMessages } from '@/lib/unread';
import { colors } from '@/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function tabIcon(name: IconName) {
  return ({ color, size }: { color: ColorValue; size: number }) => (
    <Ionicons name={name} color={color} size={size} />
  );
}

/**
 * Одно приложение, две роли. Заказчик: Главная (карта + заказ), Заказы,
 * Помощник, Профиль. Исполнитель: Лента, Мои заказы, Техника, Профиль; в
 * «Режиме заказчика» он видит вкладки заказчика. `href: null` прячет вкладку,
 * но маршрут остаётся доступен по ссылке.
 */
export default function TabsLayout() {
  const { user, token } = useAuth();
  const { mode } = usePrefs();
  // Непрочитанные сообщения в чатах по заявкам — бейдж на вкладке заказов.
  const unread = useUnreadMessages(token);
  const badge = unread > 0 ? (unread > 99 ? '99+' : unread) : undefined;
  const provider = isProviderMode(user?.role, mode);
  const forCustomer = provider ? null : undefined;
  const forProvider = provider ? undefined : null;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
        headerShadowVisible: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          minHeight: 60,
        },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Главная',
          headerShown: false,
          tabBarIcon: tabIcon('navigate-circle-outline'),
          href: forCustomer,
        }}
      />
      <Tabs.Screen
        name="feed"
        options={{
          title: 'Лента',
          headerTitle: 'Заявки рядом',
          tabBarIcon: tabIcon('flash-outline'),
          href: forProvider,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Заказы',
          headerTitle: 'Мои заказы',
          tabBarIcon: tabIcon('receipt-outline'),
          tabBarBadge: badge,
          href: forCustomer,
        }}
      />
      <Tabs.Screen
        name="jobs"
        options={{
          title: 'Мои заказы',
          tabBarIcon: tabIcon('briefcase-outline'),
          tabBarBadge: badge,
          href: forProvider,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Помощник',
          tabBarIcon: tabIcon('chatbubble-ellipses-outline'),
          href: forCustomer,
        }}
      />
      <Tabs.Screen
        name="provider"
        options={{
          title: 'Техника',
          headerTitle: 'Моя техника',
          tabBarIcon: tabIcon('construct-outline'),
          href: forProvider,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Профиль', tabBarIcon: tabIcon('person-circle-outline') }}
      />
      {/* Брони заказчика живут во вкладке «Заказы»; маршрут оставлен для ссылок помощника. */}
      <Tabs.Screen name="bookings" options={{ title: 'Брони', href: null }} />
    </Tabs>
  );
}
