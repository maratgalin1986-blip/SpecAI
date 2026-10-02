import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { Alert } from 'react-native';
import { EquipmentForm } from '@/components/EquipmentForm';

export default function NewEquipmentScreen() {
  const router = useRouter();
  return (
    <>
      <Stack.Screen options={{ title: 'Новая техника' }} />
      <EquipmentForm
        onSaved={(equipment) =>
          Alert.alert('Техника добавлена', `«${equipment.name}» появилась в вашем кабинете.`, [
            { text: 'Ок', onPress: () => router.back() },
          ])
        }
      />
    </>
  );
}
