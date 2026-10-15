import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { fetchProviderPins } from '@/lib/api';
import { providersMapHtml, type ProviderPin } from '@/lib/providersMap';
import { SITE } from '@/lib/site';
import { colors } from '@/theme';

/**
 * Карта исполнителей сервиса: базы компаний из GET /api/providers/map,
 * СпецПласт16 — первым и цветом бренда. Нажатие на точку показывает
 * компанию и число машин, «Техника исполнителя» открывает её страницу.
 * Фон главного экрана заказчика и экран «Карта».
 */
export function ProvidersMap({
  style,
  onPick,
}: {
  style?: StyleProp<ViewStyle>;
  /** A tap on the map: the work site for «Вызвать сюда» (QuickOrderSheet). */
  onPick?: (point: { lat: number; lon: number }) => void;
}) {
  const [pins, setPins] = useState<ProviderPin[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchProviderPins()
      .then((data) => !cancelled && setPins(data.providers))
      // Без точек карта всё равно показывается — заказ работает и так.
      .catch(() => !cancelled && setPins([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const html = useMemo(
    () =>
      pins === null
        ? null
        : providersMapHtml(pins, {
            primary: colors.primary,
            dark: colors.dark,
            onDark: colors.onDark,
            text: colors.text,
          }),
    [pins],
  );

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as {
        type?: string;
        catalogUrl?: string;
        lat?: number;
        lon?: number;
      };
      if (
        message.type === 'point' &&
        typeof message.lat === 'number' &&
        typeof message.lon === 'number'
      ) {
        onPick?.({ lat: message.lat, lon: message.lon });
        return;
      }
      if (message.type === 'provider' && message.catalogUrl?.startsWith('/')) {
        void WebBrowser.openBrowserAsync(`${SITE.url}${message.catalogUrl}`);
      }
    } catch {
      // Чужие сообщения страницы карты игнорируем.
    }
  };

  return (
    <View style={[styles.screen, style]}>
      {html ? (
        <WebView
          source={{ html, baseUrl: SITE.url }}
          originWhitelist={['*']}
          style={styles.webView}
          onMessage={onMessage}
          onShouldStartLoadWithRequest={(request) =>
            request.url === 'about:blank' || request.url.startsWith(SITE.url)
          }
          setSupportMultipleWindows={false}
          accessibilityLabel="Карта исполнителей"
        />
      ) : (
        <ActivityIndicator style={styles.loader} size="large" color={colors.primary} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surfaceMuted },
  webView: { flex: 1, backgroundColor: colors.surfaceMuted },
  loader: { position: 'absolute', top: '35%', alignSelf: 'center' },
});
