import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { fetchProviderPins, type BaseMachine, type LiveMachine } from '@/lib/api';
import { toBasePins, toLivePins } from '@/lib/line';
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
  live = [],
  base = [],
  me = null,
  onMachine,
}: {
  style?: StyleProp<ViewStyle>;
  /** A tap on the map: the work site for «Вызвать сюда» (QuickOrderSheet). */
  onPick?: (point: { lat: number; lon: number }) => void;
  /** Техника «на линии» вокруг (GET /api/line/nearby): зелёные значки с подписью. */
  live?: LiveMachine[];
  /** Свободные машины СпецПласт16 на базе: метка цвета бренда «на базе». */
  base?: BaseMachine[];
  /** Положение заказчика: синяя точка, карта центрируется на ней один раз. */
  me?: { lat: number; lon: number } | null;
  /** Нажатие на машину на линии. */
  onMachine?: (equipmentId: string) => void;
}) {
  const [pins, setPins] = useState<ProviderPin[] | null>(null);
  const webRef = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const centred = useRef(false);

  // Живые значки и своя точка уходят в страницу карты без перезагрузки.
  useEffect(() => {
    if (!ready) return;
    webRef.current?.injectJavaScript(
      `window.setLive && window.setLive(${JSON.stringify(toLivePins(live))}); true;`,
    );
  }, [ready, live]);
  // Машины на базе перерисовываются, только когда список и правда изменился:
  // опрос каждые 30 с не закрывает открытый список машин.
  const baseJson = useMemo(() => JSON.stringify(toBasePins(base)), [base]);
  useEffect(() => {
    if (!ready) return;
    webRef.current?.injectJavaScript(`window.setBase && window.setBase(${baseJson}); true;`);
  }, [ready, baseJson]);
  useEffect(() => {
    if (!ready || !me) return;
    const center = !centred.current;
    centred.current = true;
    webRef.current?.injectJavaScript(
      `window.setMe && window.setMe(${JSON.stringify(me)}, ${center}); true;`,
    );
  }, [ready, me]);

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
        equipmentId?: string;
        lat?: number;
        lon?: number;
      };
      if (message.type === 'machine' && typeof message.equipmentId === 'string') {
        onMachine?.(message.equipmentId);
        return;
      }
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
          ref={webRef}
          onLoadEnd={() => setReady(true)}
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
