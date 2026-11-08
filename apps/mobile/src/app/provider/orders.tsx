import { Redirect } from 'expo-router';
import React from 'react';

// Лента заявок теперь — главная вкладка исполнителя «Лента». Маршрут оставлен
// для старых ссылок (помощник «Что дальше?» ведёт сюда).
export default function ProviderOrdersRedirect() {
  return <Redirect href="/(tabs)/feed" />;
}
