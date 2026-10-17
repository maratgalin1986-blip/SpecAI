import { Redirect } from 'expo-router';
import React from 'react';
import { Loader } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { isProviderMode, usePrefs } from '@/lib/prefs';
import { useWelcomeSeen } from '@/lib/welcome';

/**
 * Точка входа: приветствие при первом запуске (два пути — заказчик и
 * исполнитель), вход, «Лента» исполнителя, «Смены» машиниста или главная
 * заказчика (карта). Открывается при старте и сразу после входа (первый экран
 * корневого Stack), поэтому главная с картой у исполнителя не монтируется.
 */
export default function Index() {
  const { token, user } = useAuth();
  const { loaded, mode } = usePrefs();
  const welcomeSeen = useWelcomeSeen();
  if (!token) {
    if (welcomeSeen === null) return <Loader />;
    return <Redirect href={welcomeSeen ? '/(auth)/login' : '/(auth)/welcome'} />;
  }
  if (user?.role === 'PROVIDER_ADMIN' && !loaded) return <Loader />;
  // Машинист видит только свои смены.
  if (user?.role === 'PROVIDER_OPERATOR') return <Redirect href="/(tabs)/shifts" />;
  return <Redirect href={isProviderMode(user?.role, mode) ? '/(tabs)/feed' : '/(tabs)'} />;
}
