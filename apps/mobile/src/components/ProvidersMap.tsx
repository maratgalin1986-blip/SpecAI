import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { fetchProviderPins, type BaseMachine, type LiveMachine } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { toBasePins, toLiveMarkers } from '@/lib/line';
import { nearbyAround, nearbyPoints } from '@/lib/mapNearby';
import {
  bboxParam,
  mergeInBox,
  providersMapHtml,
  safeSitePath,
  scriptJson,
  safeTel,
  toPageCustomers,
  toPagePins,
  type CustomerPin,
  type IntakePin,
  type MapBox,
  type ProviderPin,
} from '@/lib/providersMap';
import { SITE } from '@/lib/site';
import { colors } from '@/theme';

/** Аргументы window.setPins: точки исполнителей и заявок, как их знает страница карты. */
function pinsScript(pins: ProviderPin[], customers: CustomerPin[]): string {
  return `${scriptJson(toPagePins(pins))}, ${scriptJson(toPageCustomers(customers))}`;
}

/**
 * Карта «все видят всех» (GET /api/providers/map): исполнители — с машиной
 * на линии с зелёным кольцом, без неё приглушённые, СпецПласт16 первым и
 * цветом бренда — и открытые заявки «Заказчик рядом». Карточка точки: город,
 * техника, цена, «Позвонить» (если исполнитель показывает номер) или
 * «Написать», список ближайших; «Техника исполнителя» открывает его
 * страницу. После сдвига карта перечитывает точки своего окна (?bbox=).
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
  const router = useRouter();
  const { user } = useAuth();
  // Первая загрузка — в HTML страницы; дальше точки меняются без перезагрузки
  // карты (window.setPins), поэтому актуальный список живёт в ref.
  const [initial, setInitial] = useState<{
    pins: ProviderPin[];
    customers: CustomerPin[];
    // «Приём заявок» площадки в крупных городах без исполнителей рядом.
    intake: IntakePin[];
  } | null>(null);
  const pinsRef = useRef<ProviderPin[]>([]);
  const customersRef = useRef<CustomerPin[]>([]);
  // Что страница карты уже нарисовала (аргументы последнего window.setPins).
  const drawn = useRef('');
  const webRef = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const centred = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Живые значки и своя точка уходят в страницу карты без перезагрузки.
  // Машины без GPS в одной точке (парк СпецПласт16 на базе) — один значок.
  // Перерисовка — только когда список и правда изменился: опрос каждые 30 с
  // не закрывает открытый список машин.
  const liveMarkers = useMemo(() => toLiveMarkers(live), [live]);
  const liveRef = useRef(liveMarkers);
  liveRef.current = liveMarkers;
  const liveJson = useMemo(() => scriptJson(liveMarkers), [liveMarkers]);
  useEffect(() => {
    if (!ready) return;
    webRef.current?.injectJavaScript(`window.setLive && window.setLive(${liveJson}); true;`);
  }, [ready, liveJson]);
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
      .then((data) => {
        if (cancelled) return;
        pinsRef.current = data.providers ?? [];
        customersRef.current = data.customers ?? [];
        drawn.current = pinsScript(pinsRef.current, customersRef.current);
        setInitial({
          pins: pinsRef.current,
          customers: customersRef.current,
          intake: data.intake ?? [],
        });
      })
      // Без точек карта всё равно показывается — заказ работает и так.
      .catch(() => !cancelled && setInitial({ pins: [], customers: [], intake: [] }));
    return () => {
      cancelled = true;
    };
  }, []);

  const html = useMemo(
    () =>
      initial === null
        ? null
        : providersMapHtml(
            initial.pins,
            {
              primary: colors.primary,
              dark: colors.dark,
              onDark: colors.onDark,
              text: colors.text,
            },
            initial.intake,
            initial.customers,
          ),
    [initial],
  );

  // Карта сдвинулась и постояла (страница ждёт 400 мс): точки её окна.
  // Ответ на устаревшее окно отбрасывается; при ошибке остаются прежние точки.
  const boxSeq = useRef(0);
  const lastBox = useRef<string | null>(null);
  const loadBox = useCallback((box: MapBox) => {
    const bbox = bboxParam(box);
    if (!bbox || bbox === lastBox.current) return;
    lastBox.current = bbox;
    const seq = ++boxSeq.current;
    fetchProviderPins({ bbox })
      .then((data) => {
        if (!mounted.current || seq !== boxSeq.current) return;
        pinsRef.current = mergeInBox(pinsRef.current, data.providers ?? [], box);
        customersRef.current = mergeInBox(customersRef.current, data.customers ?? [], box);
        // Те же точки, что уже нарисованы (первое окно после загрузки) — не перерисовываем.
        const next = pinsScript(pinsRef.current, customersRef.current);
        if (next === drawn.current) return;
        drawn.current = next;
        webRef.current?.injectJavaScript(`window.setPins && window.setPins(${next}); true;`);
      })
      .catch(() => {
        if (seq === boxSeq.current) lastBox.current = null;
      });
  }, []);

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as {
        type?: string;
        catalogUrl?: string;
        equipmentId?: string;
        city?: string;
        lat?: number;
        lon?: number;
        key?: string;
        href?: string;
        orderUrl?: string;
        id?: string;
        south?: number;
        west?: number;
        north?: number;
        east?: number;
      };
      if (message.type === 'bbox') {
        const { south, west, north, east } = message;
        if (
          typeof south === 'number' &&
          typeof west === 'number' &&
          typeof north === 'number' &&
          typeof east === 'number'
        ) {
          loadBox({ south, west, north, east });
        }
        return;
      }
      // Нажали на значок: карта его центрирует, приложение считает ближайших.
      if (message.type === 'select' && typeof message.key === 'string') {
        const items = nearbyAround(
          message.key,
          nearbyPoints(pinsRef.current, customersRef.current, liveRef.current),
        ).map((item) => ({
          key: item.key,
          title: item.title,
          sub: item.sub,
          distance: item.distance,
        }));
        webRef.current?.injectJavaScript(
          `window.showNearby && window.showNearby(${scriptJson(message.key)}, ${scriptJson(
            items,
          )}); true;`,
        );
        return;
      }
      // «Позвонить»: номер исполнитель показывает сам; набор — в телефоне.
      if (message.type === 'call') {
        const href = safeTel(message.href);
        if (href) void Linking.openURL(href).catch(() => undefined);
        return;
      }
      // «Написать»: заявка этому исполнителю — форма сайта с его адресом.
      if (message.type === 'write') {
        const path = safeSitePath(message.orderUrl);
        if (path?.startsWith('/orders')) void WebBrowser.openBrowserAsync(`${SITE.url}${path}`);
        return;
      }
      // «Заказчик рядом»: исполнителю — заявка в приложении (там «Предложить
      // цену»), остальным — её публичная страница на сайте.
      if (message.type === 'order') {
        const id = typeof message.id === 'string' ? message.id : '';
        if (user?.role === 'PROVIDER_ADMIN' && /^[\w-]{1,64}$/.test(id)) {
          router.push({ pathname: '/orders/[id]', params: { id } });
          return;
        }
        const path = safeSitePath(message.orderUrl);
        if (path?.startsWith('/orders/')) void WebBrowser.openBrowserAsync(`${SITE.url}${path}`);
        return;
      }
      // «Приём заявок»: новая заявка с этим городом в адресе, дальше как обычно.
      if (message.type === 'intake' && typeof message.city === 'string') {
        router.push({ pathname: '/orders/new', params: { address: message.city.slice(0, 100) } });
        return;
      }
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
