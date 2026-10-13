import { Stack } from 'expo-router';
import React from 'react';
import { ProvidersMap } from '@/components/ProvidersMap';

/** «Карта исполнителей» на весь экран: базы компаний сервиса (GET /api/providers/map). */
export default function MapScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Карта исполнителей' }} />
      <ProvidersMap />
    </>
  );
}
