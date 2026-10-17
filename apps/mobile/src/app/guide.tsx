import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSwitchMode } from '@/components/ModeSwitch';
import { Button, Card } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { resetHints } from '@/lib/hints';
import { modeSwitchKind } from '@/lib/modes';
import { usePrefs } from '@/lib/prefs';
import { SITE } from '@/lib/site';
import { colors, spacing, typography } from '@/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const CUSTOMER_STEPS = [
  'На главном экране выберите вид техники и укажите адрес объекта — можно просто нажать на карту.',
  'Нажмите «Заказать». «Нужна сейчас» — одна смена сегодня, «На дату» — выберите день и срок.',
  'Исполнители пришлют предложения с ценой — придёт уведомление, а сами предложения будут в «Заказах».',
  'Сравните цену и машину и нажмите «Выбрать». Вопросы можно задать в чате заявки.',
  'Когда исполнитель подтвердит бронь, появится его телефон. После работы оставьте отзыв.',
];

const PROVIDER_STEPS = [
  'Станьте исполнителем: «Профиль» → «Стать исполнителем», укажите название и где стоит техника.',
  'Добавьте технику: «Техника» → «Добавить технику». Цена за смену обязательна, фото — очень желательно.',
  'Отметьте машину «Свободна» и в «Ленте» нажмите «Выйти на линию»: заказчики увидят вас на карте, а вы — заявки рядом.',
  'В заявке нажмите «Предложить цену» (подача + смены) или «Беру по прайсу».',
  'Заказчик выбрал вас — подтвердите бронь в «Моих заказах». После этого откроется телефон заказчика.',
  'В день работы откройте смену и отмечайте: выехал, на объекте, работа, завершить. В конце подтвердите табель.',
];

const SWITCH_STEPS = [
  'Один вход для обоих режимов: не нужно заводить второй аккаунт.',
  'Вверху главного экрана и ленты заявок есть переключатель «Заказчик | Исполнитель» — одно касание.',
  'Тот же переключатель — в «Профиле». Заявки и брони заказчика остаются при вас.',
  'Машинист видит только свои смены — переключатель ему не нужен.',
];

function Section({ icon, title, steps }: { icon: IconName; title: string; steps: string[] }) {
  return (
    <Card style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon} size={22} color={colors.primary} />
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {title}
        </Text>
      </View>
      {steps.map((step, index) => (
        <View key={step} style={styles.step}>
          <View style={styles.stepNumber}>
            <Text style={styles.stepNumberText}>{index + 1}</Text>
          </View>
          <Text style={styles.stepText}>{step}</Text>
        </View>
      ))}
    </Card>
  );
}

/**
 * «Как пользоваться» (владелец, 2026-10-17): коротко для заказчика, для
 * исполнителя и как переключаться. Открывается из профиля и по «?» в шапке
 * главной и ленты; внизу — «Показать подсказки снова».
 */
export default function GuideScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { mode } = usePrefs();
  const switchMode = useSwitchMode({ fromStack: true });
  const [hintsBack, setHintsBack] = useState(false);
  const kind = modeSwitchKind(user?.role);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.lead}>
        {SITE.name} — заказ спецтехники и работа на своей технике. Коротко, как всё устроено.
      </Text>

      <Section icon="cart-outline" title="Я заказываю технику" steps={CUSTOMER_STEPS} />
      <Section icon="construct-outline" title="Я исполнитель" steps={PROVIDER_STEPS} />
      <Section icon="swap-horizontal" title="Как переключаться" steps={SWITCH_STEPS} />

      {kind === 'become' ? (
        <Button
          title="Стать исполнителем"
          variant="dark"
          onPress={() => router.push('/become-provider')}
        />
      ) : null}
      {kind === 'switch' ? (
        <Button
          title={
            mode === 'provider' ? 'Перейти в режим «Заказчик»' : 'Перейти в режим «Исполнитель»'
          }
          variant="dark"
          onPress={() => switchMode(mode === 'provider' ? 'customer' : 'provider')}
        />
      ) : null}

      <Button
        title={hintsBack ? 'Подсказки снова включены' : 'Показать подсказки снова'}
        variant="secondary"
        disabled={hintsBack}
        onPress={() => {
          void resetHints();
          setHintsBack(true);
        }}
      />
      <Text style={styles.note}>
        Подсказки появляются на каждом шаге и прячутся по «Понятно». Вопрос — звоните {SITE.phone}.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  lead: { fontSize: 15, lineHeight: 21, color: colors.textMuted },
  section: { gap: spacing.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sectionTitle: { ...typography.heading, color: colors.text },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  stepNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: { fontSize: 13, fontWeight: '800', color: colors.primaryDark },
  stepText: { flex: 1, fontSize: 15, lineHeight: 21, color: colors.text },
  note: { fontSize: 13, lineHeight: 18, color: colors.textMuted, textAlign: 'center' },
});
