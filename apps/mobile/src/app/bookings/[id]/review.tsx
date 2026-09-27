import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button, Card, Input } from '@/components/ui';
import { ApiError, createReview } from '@/lib/api';
import { pluralizeRu } from '@/lib/format';
import { colors, spacing } from '@/lib/theme';

const RATING_HINTS: Record<number, string> = {
  1: 'Очень плохо',
  2: 'Плохо',
  3: 'Нормально',
  4: 'Хорошо',
  5: 'Отлично',
};

/** Отзыв на завершённое бронирование: рейтинг 1–5 звёзд и комментарий. */
export default function ReviewScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const router = useRouter();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    Keyboard.dismiss();
    setError(null);
    if (!id) return;
    setSubmitting(true);
    try {
      await createReview({ bookingId: id, rating, comment: comment.trim() || undefined });
      router.back();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось отправить отзыв');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Отзыв' }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 96 : 0}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          {name ? <Text style={styles.subtitle}>{name}</Text> : null}

          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>Оценка</Text>
            <View style={styles.stars} accessibilityRole="radiogroup">
              {[1, 2, 3, 4, 5].map((value) => (
                <Pressable
                  key={value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: value === rating }}
                  accessibilityLabel={pluralizeRu(value, ['звезда', 'звезды', 'звёзд'])}
                  onPress={() => setRating(value)}
                  hitSlop={6}
                >
                  <Ionicons
                    name={value <= rating ? 'star' : 'star-outline'}
                    size={40}
                    color={value <= rating ? colors.primary : colors.textSoft}
                  />
                </Pressable>
              ))}
            </View>
            <Text style={styles.ratingHint}>
              {RATING_HINTS[rating]} · {pluralizeRu(rating, ['звезда', 'звезды', 'звёзд'])}
            </Text>
          </Card>

          <Card style={styles.section}>
            <Input
              label="Комментарий (необязательно)"
              value={comment}
              onChangeText={setComment}
              placeholder="Как прошла аренда? Состояние техники, пунктуальность, общение."
              multiline
              numberOfLines={5}
              maxLength={2000}
              style={styles.textarea}
              textAlignVertical="top"
            />
          </Card>

          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button title="Отправить отзыв" onPress={handleSubmit} loading={submitting} />
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: spacing.lg, paddingBottom: spacing.xl * 2, gap: spacing.lg },
  subtitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  ratingHint: { textAlign: 'center', fontSize: 14, color: colors.textMuted },
  textarea: { minHeight: 120, paddingTop: spacing.md },
  error: { color: colors.danger, fontSize: 14 },
});
