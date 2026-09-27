# @specai/mobile — мобильное приложение «СпецПласт16»

Приложение компании **СпецПласт16** (аренда спецтехники с оператором, Набережные Челны и
Татарстан) на [Expo](https://expo.dev) (React Native, SDK 57, expo-router). Работает поверх
API сайта из `apps/web`: вход и регистрация, каталог техники с поиском и пагинацией, карточка
техники с бронированием, мои бронирования и оплата через Stripe Checkout, заявки и
предложения поставщиков, отзывы, чат с ИИ-ассистентом, профиль, заявка на обратный звонок и
экран «О компании». Пакет по-прежнему называется `@specai/mobile`, slug/scheme — `specai`,
идентификаторы `com.specai.app` (см. `app.json`); в магазинах приложение называется
«СпецПласт16».

## Бренд и контакты

- Название, телефон, e-mail, город, режим работы и услуги — в `src/lib/site.ts` (копия
  `apps/web/src/lib/site.ts` на сайте; при изменении обновите оба файла). Ссылки на сайт
  строятся от `EXPO_PUBLIC_API_URL` — сайт и API на одном хосте.
- Цвета (`src/lib/theme.ts`) — как на сайте: tailwind `amber-600` (`#d97706`) для акцентов и
  `slate` для текста/фона.
- Цены (`src/lib/format.ts`): `formatMoney` — RUB по умолчанию, формат «12 500 ₽» (ru-RU);
  `formatRate` — главная цена как на сайте: «от 2 500 ₽/час», смена 8 ч — `dailyRate`; если
  `hourlyRate` не задан — `dailyRate` за сутки. Стоимость бронирования считается, как в
  `POST /api/bookings`: дни × `dailyRate` (серверная логика не менялась).
- **Обратный звонок.** Экран `callback` (модальный, доступен без входа) отправляет
  `POST /api/leads` — тот же роут, что форма «Заказать звонок» на сайте (имя, телефон,
  комментарий, `consent: true`, `source: mobile:*`). Кнопки «Позвонить» (`Linking.openURL('tel:…')`)
  и «Заказать звонок» (`src/components/ContactActions.tsx`) есть на экране входа, в каталоге,
  в карточке техники, в профиле и на экране `about` («О компании»: контакты, услуги, ссылки на
  разделы сайта).

## Как это устроено

- **Авторизация.** `POST /api/mobile/login` возвращает JWT (HS256, 30 дней, подписан
  `NEXTAUTH_SECRET`). Токен хранится в `expo-secure-store` и передаётся в заголовке
  `Authorization: Bearer <jwt>`. Токен, выданный до смены пароля, сервер отклоняет (401), и
  приложение автоматически разлогинивает пользователя. `GET /api/mobile/me` — текущий пользователь.
- **API-клиент.** `src/lib/api.ts` — `fetch` с базовым URL из `EXPO_PUBLIC_API_URL` и Bearer из
  SecureStore. Чат читает SSE через `XMLHttpRequest.onprogress` (`src/lib/sse.ts`), так как у
  `fetch` в React Native нет `ReadableStream`.
- **Экраны** (`src/app`, expo-router): `(auth)/login`, `(auth)/register` — регистрация клиента
  (`POST /api/auth/register` с `accountType: CUSTOMER`, затем автологин), `(tabs)/index` — каталог,
  `equipment/[id]` — карточка и бронирование, `(tabs)/bookings` — бронирования с оплатой и отзывами,
  `bookings/[id]/review` — отзыв, `(tabs)/orders` — мои заявки, `orders/new` — новая заявка,
  `orders/[id]` — заявка и предложения с кнопкой «Принять», `(tabs)/chat`, `(tabs)/profile`,
  `callback` — заявка на звонок и `about` — о компании (оба доступны без входа).
- **Даты.** `src/components/DateField.tsx` — обёртка над `@react-native-community/datetimepicker`:
  на iOS компактный inline-пикер, на Android системный диалог (`DateTimePickerAndroid.open`).
  Расчёт стоимости (дни × ставка) показывается до отправки бронирования.
- **Оплата.** `POST /api/bookings/[id]/checkout` возвращает ссылку Stripe Checkout, она
  открывается через `expo-web-browser` (`openBrowserAsync`); после закрытия браузера список
  перечитывается. Статус оплаты приходит из `depositPaid` и `payment.status` в `GET /api/bookings`
  (его выставляет webhook Stripe, поэтому обновление может быть с задержкой).
- **Заявки.** `GET /api/orders` — мои заявки (все статусы; `?open=1` — лента открытых заявок для поставщиков), `GET /api/orders/[id]` — заявка
  с предложениями (`bids` с техникой и компанией) и флагом `isOwner`, `POST /api/bids/[id]/accept`.
- **Восстановление пароля** — на сайте: ссылка «Забыли пароль?» открывает
  `${API_URL}/forgot-password` во встроенном браузере.
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

Иконка и сплэш (`assets/`) генерируются `scripts/generate-assets.py` (нужен Pillow и TTF-шрифт
с кириллицей): оранжевая плашка `#d97706` с буквами «СП16» — в стиле `apps/web/src/app/icon.svg`.
Если появится фирменный логотип, замените PNG в `assets/` или подправьте скрипт.

## Тестирование через Expo Go

Приложение можно проверить на телефоне без компьютера и без магазинов — через
[EAS Update](https://docs.expo.dev/eas-update/introduction/) и [Expo Go](https://expo.dev/go).
Проект привязан к аккаунту Expo `maratgalin1986s-team` (`owner` и `extra.eas.projectId` в
`app.json`), обновления публикуются в ветку `preview` (профиль `preview` в `eas.json`,
`runtimeVersion` — политика `appVersion`, то есть версия из `app.json`).

Публикация (нужен `EXPO_TOKEN` робота или `eas login`):

```bash
cd apps/mobile
npx eas whoami                                   # должен показать аккаунт
EXPO_PUBLIC_API_URL=https://<prod-url> npx eas update --branch preview \
  --message "описание изменений" --platform all
npx eas update:list --branch preview             # id и ссылки на обновления
```

Адрес API вшивается в бандл в момент публикации, поэтому `EXPO_PUBLIC_API_URL` обязателен
и должен указывать на продакшен-сайт (не `localhost`). После публикации команда печатает
ссылку на страницу обновления — `https://expo.dev/accounts/maratgalin1986s-team/projects/specai/updates/<group-id>`.

На телефоне:

1. Установите Expo Go (App Store / Google Play). Expo Go поддерживает только текущий SDK —
   для этого приложения нужен **SDK 57**; если в магазине уже более новая версия Expo Go,
   обновите `expo` в `package.json` (`npx expo install --fix`) и опубликуйте заново.
2. Войдите в Expo Go под аккаунтом, у которого есть доступ к организации
   `maratgalin1986s-team` — ветка `preview` видна на вкладке проекта; либо откройте ссылку
   на обновление (или отсканируйте QR со страницы обновления на expo.dev) камерой телефона.
3. В приложении зарегистрируйтесь как клиент или войдите существующим аккаунтом сайта.

Ограничения Expo Go: нативные модули только из состава SDK (у нас так и есть), push и
собственная иконка/сплэш не показываются — для этого нужна сборка `eas build`.

## Сборка через EAS

Нативные сборки делаются в облаке [EAS Build](https://docs.expo.dev/build/introduction/):

```bash
cd apps/mobile                 # eas-cli установлен как devDependency, вызывайте npx eas
npx eas login                  # или EXPO_TOKEN в окружении
npx eas build --platform android --profile preview   # APK для тестов (канал preview)
npx eas build --platform ios --profile preview       # сборка для TestFlight / устройств
npx eas build --platform all --profile production    # магазинные сборки (канал production)
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

Публикация: `npx eas submit --platform ios|android` после успешной production-сборки.
Профили `preview` и `production` в `eas.json` привязаны к одноимённым каналам EAS Update,
так что `eas update --channel production` доставит JS-обновление в магазинную сборку без
пересборки.

## Ограничения

- Регистрация в приложении — только для клиентов; аккаунт поставщика создаётся на сайте.
- Восстановление пароля и сама страница Stripe Checkout открываются во встроенном браузере,
  не нативно.
- После оплаты приложение не получает push/deep link — статус «Оплачено» появляется после
  обновления списка, когда webhook Stripe обработает платёж.

## Кабинет поставщика (роль PROVIDER_ADMIN)

Вкладка «Кабинет» показывается только поставщикам: «Моя техника» (`GET /api/equipment?mine=1`)
и «Бронирования» техники компании (`GET /api/bookings?as=provider`) с кнопками смены статуса
(`PATCH /api/bookings/[id]`, те же переходы, что на сайте). Экран `provider/equipment/new` —
добавление техники: фото через `expo-image-picker` → `POST /api/uploads` (multipart, Bearer),
«Извлечь характеристики из фото» → `POST /api/ai/extract-specs`, затем `POST /api/equipment`
(цена за машино-час `hourlyRate` необязательна; смена 8 ч `dailyRate` обязательна и, как на
сайте, подставляется как часовая × 8).
Экран `provider/orders` — открытые заявки клиентов и отправка предложения
(`POST /api/orders/[id]/bids`).
