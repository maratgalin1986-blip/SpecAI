import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { EquipmentForm } from '@/components/EquipmentForm';
import { ErrorBanner, Loader } from '@/components/ui';
import { ApiError, fetchMyEquipmentById, type Equipment } from '@/lib/api';

/** Правка своей техники: статус, цены, описание, характеристики, фото. */
export default function EditEquipmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchMyEquipmentById(String(id));
      setEquipment(data.equipment);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось загрузить технику');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <Stack.Screen options={{ title: 'Изменить технику' }} />
      {error ? (
        <ErrorBanner message={error} onRetry={() => void load()} />
      ) : equipment === null ? (
        <Loader />
      ) : (
        <EquipmentForm
          initial={equipment}
          onSaved={(saved) =>
            Alert.alert('Сохранено', `Изменения «${saved.name}» сохранены.`, [
              { text: 'Ок', onPress: () => router.back() },
            ])
          }
        />
      )}
    </>
  );
}
