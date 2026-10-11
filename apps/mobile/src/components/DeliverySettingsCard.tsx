import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Card, Input } from '@/components/ui';
import { ApiError, fetchMyCompanyPin, updateMyCompanyPin } from '@/lib/api';
import { parseAmount } from '@/lib/providerFeed';
import { colors, spacing } from '@/theme';

/**
 * «Радиус выезда и подача» в кабинете исполнителя: заявки дальше радиуса
 * от базы не присылаются; цена за км подставляется в «подачу» предложения.
 * Сохраняется через PATCH /api/companies/me.
 */
export function DeliverySettingsCard() {
  const [radius, setRadius] = useState('');
  const [pricePerKm, setPricePerKm] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMyCompanyPin()
      .then(({ company }) => {
        if (cancelled) return;
        setRadius(String(company.deliveryRadiusKm ?? 100));
        setPricePerKm(
          company.deliveryPricePerKm == null ? '' : String(Number(company.deliveryPricePerKm)),
        );
        setLoaded(true);
      })
      .catch(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    setMessage(null);
    const km = Math.round(parseAmount(radius));
    if (!Number.isFinite(km) || km < 5 || km > 1000) {
      setMessage({ ok: false, text: 'Радиус — от 5 до 1000 км' });
      return;
    }
    const price = pricePerKm.trim() === '' ? null : parseAmount(pricePerKm);
    if (price !== null && (!Number.isFinite(price) || price < 0)) {
      setMessage({ ok: false, text: 'Цена за км — число не меньше нуля' });
      return;
    }
    setSaving(true);
    try {
      await updateMyCompanyPin({ deliveryRadiusKm: km, deliveryPricePerKm: price });
      setMessage({ ok: true, text: 'Сохранено' });
    } catch (caught) {
      setMessage({
        ok: false,
        text: caught instanceof ApiError ? caught.message : 'Не удалось сохранить',
      });
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return null;

  return (
    <Card style={styles.card}>
      <View style={styles.titleRow}>
        <Ionicons name="navigate-outline" size={20} color={colors.primaryDark} />
        <Text style={styles.title}>Радиус выезда и подача</Text>
      </View>
      <Text style={styles.hint}>
        Заявки дальше радиуса от базы вам не приходят. Цена за км подставляется в «подачу»
        предложения: расстояние до объекта × цена.
      </Text>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Input
            label="Радиус, км"
            value={radius}
            onChangeText={setRadius}
            keyboardType="number-pad"
            maxLength={4}
          />
        </View>
        <View style={styles.flex}>
          <Input
            label="Подача, ₽ за км"
            value={pricePerKm}
            onChangeText={setPricePerKm}
            placeholder="например, 80"
            keyboardType="decimal-pad"
            maxLength={8}
          />
        </View>
      </View>
      {message ? (
        <Text style={[styles.message, { color: message.ok ? colors.success : colors.danger }]}>
          {message.text}
        </Text>
      ) : null}
      <Button title="Сохранить" variant="secondary" loading={saving} onPress={() => void save()} />
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { gap: spacing.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  hint: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  row: { flexDirection: 'row', gap: spacing.sm },
  message: { fontSize: 14 },
});
