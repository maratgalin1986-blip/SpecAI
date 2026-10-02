import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Card } from '@/components/ui';
import {
  ApiError,
  createComment,
  fetchComments,
  type CommentTarget,
  type PublicComment,
} from '@/lib/api';
import { formatDate } from '@/lib/format';
import { colors, radius, spacing } from '@/lib/theme';

const MIN_LENGTH = 10;
const MAX_LENGTH = 1000;

/**
 * Опубликованные комментарии об исполнителе или заказчике и форма нового
 * комментария (если сервер разрешает: была бронь или предложение по заявке).
 */
export function CommentsSection({
  target,
  title,
  formLabel,
}: {
  target: CommentTarget;
  title: string;
  formLabel: string;
}) {
  const [comments, setComments] = useState<PublicComment[] | null>(null);
  const [canComment, setCanComment] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const key = 'companyId' in target ? `c:${target.companyId}` : `u:${target.userId}`;

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await fetchComments(target);
      setComments(data.comments);
      setCanComment(data.canComment);
    } catch (caught) {
      setComments([]);
      setLoadError(
        caught instanceof ApiError ? caught.message : 'Не удалось загрузить комментарии',
      );
    }
    // `key` описывает цель полностью; сам объект target пересоздаётся при каждом рендере.
  }, [key]);

  useEffect(() => {
    void load();
  }, [load]);

  const send = async () => {
    setError(null);
    setSending(true);
    try {
      const result = await createComment(target, text);
      setSent(result.message || 'Комментарий отправлен на проверку');
      setText('');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось отправить комментарий');
    } finally {
      setSending(false);
    }
  };

  const length = text.trim().length;

  return (
    <Card style={styles.section}>
      <Text style={styles.title}>{title}</Text>
      {comments === null ? (
        <Text style={styles.muted}>Загрузка…</Text>
      ) : comments.length === 0 ? (
        <Text style={styles.muted}>{loadError ?? 'Комментариев пока нет.'}</Text>
      ) : (
        comments.map((comment) => (
          <View key={comment.id} style={styles.comment}>
            <Text style={styles.text}>{comment.text}</Text>
            <Text style={styles.muted}>
              {comment.authorName}
              {comment.authorCompany ? ` · ${comment.authorCompany}` : ''} ·{' '}
              {formatDate(comment.createdAt)}
            </Text>
          </View>
        ))
      )}
      {sent ? (
        <Text style={styles.success}>{sent}</Text>
      ) : canComment ? (
        <View style={styles.form}>
          <Text style={styles.label}>{formLabel}</Text>
          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            maxLength={MAX_LENGTH}
            placeholder="Как прошла работа. Телефоны и ссылки будут скрыты."
            placeholderTextColor={colors.textSoft}
            style={styles.input}
          />
          <Text style={styles.muted}>
            {length}/{MAX_LENGTH} · от {MIN_LENGTH} символов · публикуется после проверки
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button
            title="Отправить"
            loading={sending}
            disabled={length < MIN_LENGTH}
            onPress={() => void send()}
          />
        </View>
      ) : comments !== null && !loadError ? (
        <Text style={styles.muted}>
          Комментарий можно оставить после брони или предложения по заявке.
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  comment: {
    gap: 2,
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  text: { fontSize: 14, color: colors.text, lineHeight: 20 },
  muted: { fontSize: 12, color: colors.textMuted },
  form: { gap: spacing.sm, marginTop: spacing.xs },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  input: {
    minHeight: 90,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.background,
    textAlignVertical: 'top',
  },
  error: { fontSize: 13, color: colors.danger },
  success: { fontSize: 14, color: colors.success, fontWeight: '600' },
});
