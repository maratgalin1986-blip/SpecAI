import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useCallback, useRef, useState } from 'react';
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
import { ApiError, fetchGuide, sendAgentMessage } from '@/lib/api';
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

/** «Что дальше?» отвечает помощник по данным с сервера — без ИИ-ключа и без истории диалога. */
const WHAT_NEXT =
  /что\s+(?:мне\s+)?(?:дальше|делать)|следующ\p{L}*\s+шаг|с\s+чего\s+начать|^\s*дальше\s*\??\s*$/iu;

/** Ответ диспетчера с сайта: ссылки [текст](/путь) показываем просто текстом. */
function plainText(reply: string): string {
  return reply.replace(/\[([^\]]+)\]\((?:[^)\s]+)\)/g, '$1');
}

/**
 * Чат — тот же диспетчер, что на сайте (POST /api/ai/agents): с ИИ-ключом
 * отвечают ИИ-агенты, без ключа — правиловые ответы и приём заявки по
 * телефону. История диалога живёт на экране и уходит с каждым сообщением.
 */
export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const ready = true;
  const listRef = useRef<FlatList<UiMessage>>(null);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, []);

  const askWhatNext = (text = 'Что дальше?') => {
    if (streaming) return;
    const assistantId = nextId();
    setMessages((prev) => [
      ...prev,
      { id: nextId(), role: 'user', content: text },
      { id: assistantId, role: 'assistant', content: '', pending: true },
    ]);
    scrollToEnd();
    fetchGuide()
      .then((guide) => ({ content: guide.reply, error: false }))
      .catch((caught: unknown) => ({
        content: caught instanceof ApiError ? caught.message : 'Помощник сейчас недоступен',
        error: true,
      }))
      .then(({ content, error }) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content, error, pending: false } : m)),
        );
        scrollToEnd();
      });
  };

  const send = () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput('');
    if (WHAT_NEXT.test(text)) {
      askWhatNext(text);
      return;
    }

    const userMessage: UiMessage = { id: nextId(), role: 'user', content: text };
    const assistantId = nextId();
    setMessages((prev) => [
      ...prev,
      userMessage,
      { id: assistantId, role: 'assistant', content: '', pending: true },
    ]);
    setStreaming(true);
    scrollToEnd();

    const patchAssistant = (patch: Partial<UiMessage>) =>
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, ...patch } : m)));

    const history = [
      ...messages.filter((m) => !m.error && !m.pending && m.content.trim()),
      userMessage,
    ]
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));

    sendAgentMessage(history)
      .then((result) => patchAssistant({ content: plainText(result.reply), pending: false }))
      .catch((caught: unknown) =>
        patchAssistant({
          content: caught instanceof ApiError ? caught.message : 'Ассистент сейчас недоступен',
          pending: false,
          error: true,
        }),
      )
      .finally(() => {
        setStreaming(false);
        scrollToEnd();
      });
  };

  const startNewConversation = () => {
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
          ) : null
        }
        ListHeaderComponent={
          messages.length > 0 ? (
            <Pressable onPress={startNewConversation} style={styles.newChat}>
              <Text style={styles.newChatText}>Начать новый диалог</Text>
            </Pressable>
          ) : null
        }
        keyboardShouldPersistTaps="handled"
      />
      <View style={styles.quickRow}>
        <Pressable
          onPress={() => askWhatNext()}
          disabled={streaming}
          accessibilityRole="button"
          style={({ pressed }) => [styles.quick, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.quickText}>Что дальше?</Text>
        </Pressable>
        <Text style={styles.quickHint}>Помощник подскажет следующий шаг</Text>
      </View>
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
  quickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  quick: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  quickText: { color: colors.primaryDark, fontWeight: '700', fontSize: 13 },
  quickHint: { flex: 1, color: colors.textMuted, fontSize: 12 },
});
