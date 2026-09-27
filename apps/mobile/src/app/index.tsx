import { Redirect } from 'expo-router';
import React from 'react';
import { useAuth } from '@/lib/auth';

/** Точка входа: ведём на вход или в каталог в зависимости от сессии. */
export default function Index() {
  const { token } = useAuth();
  return <Redirect href={token ? '/(tabs)' : '/(auth)/login'} />;
}
