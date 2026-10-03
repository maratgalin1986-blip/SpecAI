import { Stack, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { Button, ErrorBanner } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { SITE } from '@/lib/site';
import { colors, spacing } from '@/lib/theme';

/**
 * «Карта исполнителей»: страница сайта /map (Leaflet + OSM) во встроенном
 * WebView, без шапки сайта (?embed=1). Ссылки из карточки поставщика уходят
 * из WebView: «Оставить заявку» открывает форму заявки в приложении,
 * остальное — во встроенном браузере.
 */
const MAP_URL = `${SITE.url}/map?embed=1`;

function sitePath(url: string): string | null {
  if (!url.startsWith(SITE.url)) return null;
  return url.slice(SITE.url.length) || '/';
}

export default function MapScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const webView = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const handleNavigation = (request: WebViewNavigation) => {
    const path = sitePath(request.url);
    if (path !== null && path.startsWith('/map')) return true;
    if (request.url === 'about:blank') return true;
    if (path !== null && /^\/orders\/?(\?|$)/.test(path) && token) {
      router.push('/orders/new');
      return false;
    }
    void WebBrowser.openBrowserAsync(request.url);
    return false;
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: 'Заказ на карте' }} />
      {failed ? (
        <View style={styles.fallback}>
          <ErrorBanner
            message="Не удалось открыть карту в приложении"
            onRetry={() => {
              setFailed(false);
              setLoading(true);
              webView.current?.reload();
            }}
          />
          <Button
            title="Открыть карту в браузере"
            variant="secondary"
            onPress={() => void WebBrowser.openBrowserAsync(`${SITE.url}/map`)}
          />
        </View>
      ) : null}
      <WebView
        ref={webView}
        source={{ uri: MAP_URL }}
        style={[styles.webView, failed && styles.hidden]}
        onShouldStartLoadWithRequest={handleNavigation}
        onLoadEnd={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setFailed(true);
        }}
        onHttpError={(event) => {
          if (event.nativeEvent.statusCode >= 500) setFailed(true);
        }}
        setSupportMultipleWindows={false}
        allowsBackForwardNavigationGestures={false}
      />
      {loading && !failed ? (
        <ActivityIndicator style={styles.loader} size="large" color={colors.primary} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  webView: { flex: 1, backgroundColor: colors.background },
  hidden: { display: 'none' },
  loader: { position: 'absolute', top: '45%', alignSelf: 'center' },
  fallback: { padding: spacing.lg, gap: spacing.md },
});
