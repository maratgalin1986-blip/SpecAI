import { Stack } from 'expo-router';
import React from 'react';
import { MapWebView } from '@/components/MapWebView';
import { SITE } from '@/lib/site';

/** «Карта спроса»: страница сайта /map?layer=demand — цветные круги по городам. */
export default function DemandMapScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Карта спроса' }} />
      <MapWebView url={`${SITE.url}/map?embed=1&layer=demand`} />
    </>
  );
}
