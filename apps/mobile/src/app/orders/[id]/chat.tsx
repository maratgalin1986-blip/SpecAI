import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorBanner, Loader } from '@/components/ui';
import {
  ApiError,
  fetchThreadMessages,
  markThreadRead,
  openOrderThread,
  sendThreadMessage,
  type OrderChatMessage,
  type OrderThreadView,
} from '@/lib/api';
import { colors, radius, spacing, TAP, typography } from '@/theme';

/** Пока чат открыт, новые сообщения подтягиваются сами. */
const POLL_MS = 10_000;
const MAX_LENGTH = 2000;
const CONTACTS_NOTICE = 'Контакты откроются после подтверждения брони';

function timeOf(iso: string): string {
  const date = new Date(iso);
  const sameDay = new Date().toDateString() === date.toDateString();
  const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return sameDay
    ? time
    : `${date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}, ${time}`;
}

function Bubble({ message }: { message: OrderChatMessage }) {
  return (
    <View style={[styles.row, message.mine ? styles.rowMine : styles.rowTheirs]}>
      <View style={[styles.bubble, message.mine ? styles.bubbleMine : styles.bubbleTheirs]}>
        <Text style={[styles.body, message.mine && styles.bodyMine]}>{message.body}</Text>
        {message.attachmentUrl ? (
          <Text
            style={[styles.attachment, message.mine && styles.bodyMine]}
            onPress={() => void Linking.openURL(message.attachmentUrl as string)}
          >
            Вложение
          </Text>
        ) : null}
      </View>
      <Text style={styles.time}>
        {timeOf(message.createdAt)}
        {message.mine && message.readAt ? ' · прочитано' : ''}
      </Text>
    </View>
  );
}

/**
 * Чат по заявке между заказчиком и исполнителем. Заказчик открывает его с
 * `?company=` (переписка с конкретным исполнителем), исполнитель — без
 * параметра. Пока бронь не подтверждена, сервер скрывает телефоны, e-mail и
 * ссылки в сообщениях и говорит об этом отправителю.
 */
export default function OrderChatScreen() {
  const { id, company, name } = useLocalSearchParams<{
    id: string;
    company?: string;
    name?: string;
  }>();
  const insets = useSafeAreaInsets();
  const [thread, setThread] = useState<OrderThreadView | null>(null);
  const [messages, setMessages] = useState<OrderChatMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const lastIdRef = useRef<string | null>(null);

  const markRead = useCallback((threadId: string) => {
    markThreadRead(threadId).catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const opened = await openOrderThread(id, company || undefined);
      const page = await fetchThreadMessages(opened.thread.id);
      setThread(page.thread);
      setMessages(page.messages);
      setNextCursor(page.nextCursor);
      lastIdRef.current = page.messages.at(-1)?.id ?? null;
      if (page.messages.some((m) => !m.mine && !m.readAt)) markRead(opened.thread.id);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось открыть чат');
    } finally {
      setLoading(false);
    }
  }, [id, company, markRead]);

  useEffect(() => {
    void load();
  }, [load]);

  const poll = useCallback(async () => {
    if (!thread) return;
    try {
      const after = lastIdRef.current ?? undefined;
      const page = await fetchThreadMessages(thread.id, after ? { after } : {});
      setThread(page.thread);
      if (after && page.messages.length === 0) return;
      setMessages((prev) => {
        const known = new Set(prev.map((m) => m.id));
        return [...prev, ...page.messages.filter((m) => !known.has(m.id))];
      });
      lastIdRef.current = page.messages.at(-1)?.id ?? lastIdRef.current;
      if (page.messages.some((m) => !m.mine && !m.readAt)) markRead(thread.id);
    } catch {
      // Сеть моргнула — следующий опрос через 10 секунд.
    }
  }, [thread, markRead]);

  useFocusEffect(
    useCallback(() => {
      if (!thread) return undefined;
      const timer = setInterval(() => void poll(), POLL_MS);
      return () => clearInterval(timer);
    }, [thread, poll]),
  );

  const loadOlder = async () => {
    if (!thread || !nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await fetchThreadMessages(thread.id, { cursor: nextCursor });
      setMessages((prev) => [...page.messages, ...prev]);
      setNextCursor(page.nextCursor);
    } catch {
      // Старые сообщения подгрузятся при следующей прокрутке.
    } finally {
      setLoadingOlder(false);
    }
  };

  const send = async () => {
    const body = text.trim();
    if (!thread || !body || sending) return;
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      const result = await sendThreadMessage(thread.id, body);
      setText('');
      setMessages((prev) => [...prev, result.message]);
      lastIdRef.current = result.message.id;
      if (result.masked) setNotice(result.notice ?? CONTACTS_NOTICE);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось отправить сообщение');
    } finally {
      setSending(false);
    }
  };

  // FlatList inverted: новые внизу, старые подгружаются сверху.
  const data = useMemo(() => [...messages].reverse(), [messages]);
  const title = thread?.counterpart ?? name ?? 'Чат';
  const canWrite = thread?.canWrite ?? false;

  if (loading && !thread) return <Loader />;

  return (
    <>
      <Stack.Screen options={{ title }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        {thread && !thread.contactsOpen ? (
          <View style={styles.noticeBar} accessibilityRole="text">
            <Ionicons name="lock-closed-outline" size={16} color={colors.warningText} />
            <Text style={styles.noticeText}>
              {thread.notice ?? CONTACTS_NOTICE}: телефоны, e-mail и ссылки в сообщениях скрываются.
            </Text>
          </View>
        ) : null}
        {error && !thread ? (
          <View style={styles.padded}>
            <ErrorBanner message={error} onRetry={() => void load()} />
          </View>
        ) : null}
        <FlatList
          data={data}
          inverted
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <Bubble message={item} />}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          onEndReached={() => void loadOlder()}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingOlder ? <ActivityIndicator color={colors.primary} style={styles.older} /> : null
          }
          ListEmptyComponent={
            thread ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>Сообщений пока нет</Text>
                <Text style={styles.emptyText}>
                  Уточните детали работ, сроки и подачу техники. Чат видят только вы и{' '}
                  {thread.role === 'customer' ? 'этот исполнитель' : 'заказчик'}.
                </Text>
              </View>
            ) : null
          }
        />
        {thread ? (
          <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
            {notice ? <Text style={styles.maskedNotice}>{notice}</Text> : null}
            {error && thread ? <Text style={styles.errorText}>{error}</Text> : null}
            {canWrite ? (
              <View style={styles.inputRow}>
                <TextInput
                  value={text}
                  onChangeText={setText}
                  multiline
                  maxLength={MAX_LENGTH}
                  placeholder="Сообщение…"
                  placeholderTextColor={colors.textSoft}
                  accessibilityLabel="Сообщение"
                  style={styles.input}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Отправить"
                  accessibilityState={{ disabled: sending || text.trim().length === 0 }}
                  disabled={sending || text.trim().length === 0}
                  onPress={() => void send()}
                  style={({ pressed }) => [
                    styles.send,
                    (sending || text.trim().length === 0) && styles.sendDisabled,
                    pressed && styles.pressed,
                  ]}
                >
                  {sending ? (
                    <ActivityIndicator color={colors.onPrimary} />
                  ) : (
                    <Ionicons name="send" size={20} color={colors.onPrimary} />
                  )}
                </Pressable>
              </View>
            ) : (
              <Text style={styles.readOnly}>Только чтение.</Text>
            )}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  padded: { padding: spacing.lg },
  list: { padding: spacing.lg, gap: spacing.sm, flexGrow: 1 },
  older: { marginVertical: spacing.sm },
  noticeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.warningLight,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 18, color: colors.warningText },
  row: { maxWidth: '85%' },
  rowMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  rowTheirs: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  bubbleMine: { backgroundColor: colors.primary, borderBottomRightRadius: radius.sm },
  bubbleTheirs: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: radius.sm,
  },
  body: { ...typography.body, color: colors.text },
  bodyMine: { color: colors.onPrimary },
  attachment: { marginTop: spacing.xs, fontSize: 14, textDecorationLine: 'underline' },
  time: { fontSize: 11, color: colors.textSoft, marginTop: 2, marginHorizontal: spacing.xs },
  // Инвертированный список переворачивает и пустое состояние.
  empty: {
    transform: [{ scaleY: -1 }],
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.text, textAlign: 'center' },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  inputBar: {
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  input: {
    flex: 1,
    minHeight: TAP,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.background,
  },
  send: {
    width: TAP,
    height: TAP,
    borderRadius: TAP / 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  maskedNotice: { fontSize: 13, color: colors.warningText },
  errorText: { fontSize: 13, color: colors.danger },
  readOnly: { fontSize: 13, color: colors.textMuted, paddingVertical: spacing.sm },
});
