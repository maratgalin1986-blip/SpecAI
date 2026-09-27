# @specai/mobile — мобильное приложение SpecAI

Приложение на [Expo](https://expo.dev) (React Native, SDK 57, expo-router), которое работает
поверх существующего API из `apps/web`. Раунд 1: вход, каталог техники с поиском и
пагинацией, карточка техники с бронированием, мои бронирования, чат с ИИ-ассистентом, профиль.

## Как это устроено

- **Авторизация.** `POST /api/mobile/login` возвращает JWT (HS256, 30 дней, подписан
  `NEXTAUTH_SECRET`). Токен хранится в `expo-secure-store` и передаётся в заголовке
  `Authorization: Bearer <jwt>`. Токен, выданный до смены пароля, сервер отклоняет (401), и
  приложение автоматически разлогинивает пользователя. `GET /api/mobile/me` — текущий пользователь.
- **API-клиент.** `src/lib/api.ts` — `fetch` с базовым URL из `EXPO_PUBLIC_API_URL` и Bearer из
  SecureStore. Чат читает SSE через `XMLHttpRequest.onprogress` (`src/lib/sse.ts`), так как у
  `fetch` в React Native нет `ReadableStream`.
- **Экраны** (`src/app`, expo-router): `(auth)/login`, `(tabs)/index` — каталог, `equipment/[id]` —
  карточка и бронирование, `(tabs)/bookings`, `(tabs)/chat`, `(tabs)/profile`.
- **Монорепо.** `metro.config.js` следит за корнем репозитория и ищет модули в
  `apps/mobile/node_modules` и корневом `node_modules`; работает в режиме pnpm по умолчанию
  (isolated), `node-linker=hoisted` не требуется.

## Запуск в разработке

1. Установите зависимости из корня репозитория: `pnpm install`.
2. Запустите API (`pnpm dev` — Next.js на `http://localhost:3000`) или используйте продакшен.
3. Укажите адрес API и запустите Metro:

   ```bash
   EXPO_PUBLIC_API_URL=https://<prod-url> pnpm --filter @specai/mobile start
   ```

   Для локального API с физического телефона укажите IP компьютера в той же сети, например
   `EXPO_PUBLIC_API_URL=http://192.168.1.10:3000` (`localhost` на телефоне — это сам телефон).
   Переменную также можно положить в `apps/mobile/.env.local`
   (`EXPO_PUBLIC_API_URL=...`) — Expo подхватит её автоматически.

4. Установите [Expo Go](https://expo.dev/go) на телефон и отсканируйте QR-код из терминала
   (Android — из Expo Go, iOS — камерой). Также доступны `pnpm --filter @specai/mobile android`
   и `... ios` для эмуляторов/симуляторов.

Проверки: `pnpm --filter @specai/mobile typecheck`; ESLint и Prettier запускаются из корня
(`pnpm lint`, `pnpm format:check`).

Иконка и сплэш — placeholder-PNG, сгенерированные `scripts/generate-assets.py` (нужен Pillow);
замените файлы в `assets/` на настоящие перед публикацией.

## Сборка через EAS

Нативные сборки делаются в облаке [EAS Build](https://docs.expo.dev/build/introduction/):

```bash
npm i -g eas-cli
eas login                      # аккаунт Expo (бесплатный)
cd apps/mobile
eas build:configure            # создаст eas.json и projectId в app.json
eas build --platform android --profile preview   # APK для тестов
eas build --platform ios --profile preview       # сборка для TestFlight / устройств
eas build --platform all --profile production    # магазинные сборки
```

Переменную `EXPO_PUBLIC_API_URL` для сборок задайте в профиле `eas.json`
(`"env": { "EXPO_PUBLIC_API_URL": "https://<prod-url>" }`) или через `eas env:create`.

Что потребуется:

- **Apple Developer Program** (99 $/год) — для iOS-сборок, TestFlight и App Store. EAS сам
  создаст сертификаты и профили после `eas credentials`/первой сборки; понадобится Apple ID
  с доступом к команде.
- **Google Play Console** (разовый взнос 25 $) — для публикации Android; для тестовых APK
  аккаунт не нужен. Keystore EAS генерирует и хранит сам.
- Идентификаторы уже заданы в `app.json`: `com.specai.app` (iOS bundle id и Android package),
  scheme `specai`.

Публикация: `eas submit --platform ios|android` после успешной production-сборки.

## Ограничения раунда 1

- Регистрация и восстановление пароля — только на сайте.
- Оплата бронирования (Stripe Checkout) в приложение не вынесена.

## Кабинет поставщика (роль PROVIDER_ADMIN)

Вкладка «Кабинет» показывается только поставщикам: «Моя техника» (`GET /api/equipment?mine=1`)
и «Бронирования» техники компании (`GET /api/bookings?as=provider`) с кнопками смены статуса
(`PATCH /api/bookings/[id]`, те же переходы, что на сайте). Экран `provider/equipment/new` —
добавление техники: фото через `expo-image-picker` → `POST /api/uploads` (multipart, Bearer),
«Извлечь характеристики из фото» → `POST /api/ai/extract-specs`, затем `POST /api/equipment`.
Экран `provider/orders` — открытые заявки клиентов и отправка предложения
(`POST /api/orders/[id]/bids`).

- Даты бронирования вводятся текстом (`ГГГГ-ММ-ДД` или `ДД.ММ.ГГГГ`), без нативного пикера.
