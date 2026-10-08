import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { Button, ErrorBanner } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { SITE } from '@/lib/site';
import { colors, spacing } from '@/theme';

/**
 * Карта исполнителей: страница сайта /map (Leaflet + OSM) во встроенном
 * WebView, без шапки сайта (?embed=1). Ссылки из карточки поставщика уходят
 * из WebView: «Оставить заявку» открывает форму заявки в приложении,
 * остальное — во встроенном браузере. Используется экраном «Карта» и как
 * фон главного экрана заказчика.
 */
export const MAP_URL = `${SITE.url}/map?embed=1`;

function sitePath(url: string): string | null {
  if (!url.startsWith(SITE.url)) return null;
  return url.slice(SITE.url.length) || '/';
}

export function MapWebView({
  style,
  fallbackStyle,
  url = MAP_URL,
}: {
  style?: StyleProp<ViewStyle>;
  /** Отступы блока ошибки (на главном экране его не должна закрывать шторка). */
  fallbackStyle?: StyleProp<ViewStyle>;
  /** Другая страница карты сайта, например /map?embed=1&layer=demand (карта спроса). */
  url?: string;
}) {
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
    <View style={[styles.screen, style]}>
      {failed ? (
        <View style={[styles.fallback, fallbackStyle]}>
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
        source={{ uri: url }}
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
        accessibilityLabel="Карта исполнителей"
      />
      {loading && !failed ? (
        <ActivityIndicator style={styles.loader} size="large" color={colors.primary} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surfaceMuted },
  webView: { flex: 1, backgroundColor: colors.surfaceMuted },
  hidden: { display: 'none' },
  loader: { position: 'absolute', top: '35%', alignSelf: 'center' },
  fallback: { padding: spacing.lg, gap: spacing.md },
});
