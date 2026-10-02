import { Redirect } from 'expo-router';
import React from 'react';
import { Loader } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { isProviderMode, usePrefs } from '@/lib/prefs';

/** Точка входа: вход, «Лента» исполнителя или главная заказчика (карта). */
export default function Index() {
  const { token, user } = useAuth();
  const { loaded, mode } = usePrefs();
  if (!token) return <Redirect href="/(auth)/login" />;
  if (user?.role === 'PROVIDER_ADMIN' && !loaded) return <Loader />;
  return <Redirect href={isProviderMode(user?.role, mode) ? '/(tabs)/feed' : '/(tabs)'} />;
}
