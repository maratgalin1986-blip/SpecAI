import { Stack } from 'expo-router';
import React from 'react';
import { MapWebView } from '@/components/MapWebView';

/** «Карта исполнителей» на весь экран (страница сайта /map?embed=1). */
export default function MapScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Карта исполнителей' }} />
      <MapWebView />
    </>
  );
}
