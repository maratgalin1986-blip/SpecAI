import { Redirect } from 'expo-router';
import React from 'react';
import { useAuth } from '@/lib/auth';

/** Точка входа: вход, кабинет поставщика (PROVIDER_ADMIN) или каталог. */
export default function Index() {
  const { token, user } = useAuth();
  if (!token) return <Redirect href="/(auth)/login" />;
  return <Redirect href={user?.role === 'PROVIDER_ADMIN' ? '/(tabs)/provider' : '/(tabs)'} />;
}
