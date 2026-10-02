import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState } from '@/components/ui';
import { ApiError, fetchConversation } from '@/lib/api';
import { streamChat } from '@/lib/sse';
import { STORAGE_KEYS, getItem, removeItem, setItem } from '@/lib/storage';
import { colors, radius, spacing } from '@/lib/theme';

interface UiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  pending?: boolean;
  error?: boolean;
}

let localId = 0;
const nextId = () => `local-${Date.now()}-${localId++}`;

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [ready, setReady] = useState(false);
  const conversationId = useRef<string | undefined>(undefined);
  const cancelStream = useRef<(() => void) | null>(null);
  const listRef = useRef<FlatList<UiMessage>>(null);

  // Восстанавливаем диалог из SecureStore и подгружаем историю с сервера.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await getItem(STORAGE_KEYS.conversationId);
      if (cancelled) return;
      if (stored) {
        conversationId.current = stored;
        try {
          const data = await fetchConversation(stored);
          if (cancelled) return;
          setMessages(
            data.messages.map((m) => ({
              id: m.id,
              role: m.role === 'USER' ? 'user' : 'assistant',
              content: m.content,
            })),
          );
        } catch (caught) {
          // Диалог удалён или не принадлежит пользователю — начинаем новый.
          if (caught instanceof ApiError && (caught.status === 404 || caught.status === 400)) {
            conversationId.current = undefined;
            await removeItem(STORAGE_KEYS.conversationId);
          }
        }
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
      cancelStream.current?.();
    };
  }, []);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, []);

  const send = () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput('');

    const userMessage: UiMessage = { id: nextId(), role: 'user', content: text };
    const assistantId = nextId();
    setMessages((prev) => [
      ...prev,
      userMessage,
      { id: assistantId, role: 'assistant', content: '', pending: true },
    ]);
    setStreaming(true);
    scrollToEnd();

    const patchAssistant = (patch: Partial<UiMessage> | ((m: UiMessage) => Partial<UiMessage>)) =>
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, ...(typeof patch === 'function' ? patch(m) : patch) } : m,
        ),
      );

    cancelStream.current = streamChat(
      { message: text, conversationId: conversationId.current },
      {
        onEvent: (event) => {
          if (event.conversationId && event.conversationId !== conversationId.current) {
            conversationId.current = event.conversationId;
            void setItem(STORAGE_KEYS.conversationId, event.conversationId);
          }
          if (event.delta) {
            patchAssistant((m) => ({ content: m.content + event.delta, pending: false }));
            scrollToEnd();
          }
          if (event.error) {
            patchAssistant((m) => ({
              content: m.content || event.error || 'Ошибка ассистента',
              pending: false,
              error: !m.content,
            }));
          }
        },
        onError: (message) => {
          patchAssistant({ content: message, pending: false, error: true });
        },
        onClose: () => {
          cancelStream.current = null;
          setStreaming(false);
          patchAssistant((m) => (m.pending ? { content: m.content || '…', pending: false } : {}));
        },
      },
    );
  };

  const startNewConversation = async () => {
    cancelStream.current?.();
    conversationId.current = undefined;
    await removeItem(STORAGE_KEYS.conversationId);
    setMessages([]);
    setStreaming(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 44 : 0}
    >
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <MessageBubble message={item} />}
        contentContainerStyle={styles.list}
        onContentSizeChange={scrollToEnd}
        ListEmptyComponent={
          ready ? (
            <EmptyState
              title="Чем помочь?"
              description="Спросите, какая техника подойдёт под задачу, или уточните статус ваших бронирований."
            />
          ) : undefined
        }
        ListHeaderComponent={
          messages.length > 0 ? (
            <Pressable onPress={startNewConversation} style={styles.newChat}>
              <Text style={styles.newChatText}>Начать новый диалог</Text>
            </Pressable>
          ) : undefined
        }
        keyboardShouldPersistTaps="handled"
      />
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Напишите сообщение…"
          placeholderTextColor={colors.textSoft}
          multiline
          maxLength={4000}
          editable={!streaming}
        />
        <Pressable
          onPress={send}
          disabled={streaming || !input.trim()}
          accessibilityRole="button"
          accessibilityLabel="Отправить"
          style={({ pressed }) => [
            styles.sendButton,
            (streaming || !input.trim()) && styles.sendButtonDisabled,
            pressed && { opacity: 0.85 },
          ]}
        >
          <Ionicons name="arrow-up" size={20} color="#fff" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function MessageBubble({ message }: { message: UiMessage }) {
  const isUser = message.role === 'user';
  return (
    <View style={[styles.bubbleRow, isUser && styles.bubbleRowUser]}>
      <View
        style={[
          styles.bubble,
          isUser ? styles.bubbleUser : styles.bubbleAssistant,
          message.error && styles.bubbleError,
        ]}
      >
        <Text
          style={[
            styles.bubbleText,
            isUser && styles.bubbleTextUser,
            message.error && styles.bubbleTextError,
          ]}
        >
          {message.pending && !message.content ? 'Ассистент печатает…' : message.content}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, gap: spacing.sm, flexGrow: 1 },
  newChat: { alignSelf: 'center', paddingVertical: spacing.xs, marginBottom: spacing.sm },
  newChatText: { color: colors.primaryDark, fontSize: 13, fontWeight: '600' },
  bubbleRow: { flexDirection: 'row', justifyContent: 'flex-start' },
  bubbleRowUser: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '85%',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  bubbleUser: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleAssistant: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: 4,
  },
  bubbleError: { backgroundColor: colors.dangerLight, borderColor: colors.dangerLight },
  bubbleText: { fontSize: 15, lineHeight: 21, color: colors.text },
  bubbleTextUser: { color: '#fff' },
  bubbleTextError: { color: colors.danger },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.background,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { opacity: 0.4 },
});
