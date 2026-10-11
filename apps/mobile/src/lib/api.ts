import { STORAGE_KEYS, getItem } from './storage';

/**
 * Базовый URL API. Задаётся через EXPO_PUBLIC_API_URL (например,
 * https://specplast16.ru). Сайт СпецПласт16 и API живут на одном хосте. Без завершающего слэша.
 * Без переменной: при разработке — локальный сервер, в сборке — боевой сайт.
 */
const PRODUCTION_API_URL = 'https://spec-ai-web.vercel.app';
export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL || (__DEV__ ? 'http://localhost:3000' : PRODUCTION_API_URL)
).replace(/\/+$/, '');

export class ApiError extends Error {
  status: number;
  details: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

function extractError(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'error' in body) {
    const error = (body as { error: unknown }).error;
    if (typeof error === 'string') return error;
    if (error && typeof error === 'object' && 'formErrors' in error) {
      const { formErrors, fieldErrors } = error as {
        formErrors?: string[];
        fieldErrors?: Record<string, string[]>;
      };
      const first =
        formErrors?.[0] ?? Object.values(fieldErrors ?? {}).find((list) => list.length > 0)?.[0];
      if (first) return first;
    }
  }
  return fallback;
}

/**
 * Ссылка на картинку для <Image>: пути сайта («/images/…») — от API_URL,
 * https — как есть; всё остальное (javascript:, data:, http) — null.
 */
export function imageUri(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('/') && !url.startsWith('//')) return `${API_URL}${url}`;
  if (/^https:\/\//i.test(url)) return url;
  // Локальный сервер разработки отдаёт фото по http.
  if (__DEV__ && url.startsWith(`${API_URL}/`)) return url;
  return null;
}

export async function getToken(): Promise<string | null> {
  return getItem(STORAGE_KEYS.token);
}

export async function authHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Не подставлять Bearer (например, для входа). */
  anonymous?: boolean;
}

const REQUEST_TIMEOUT_MS = 20_000;

/** fetch к API с JSON-телом и Bearer-токеном из SecureStore. */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (!options.anonymous) Object.assign(headers, await authHeaders());

  let response: Response;
  // Without a timeout a hung network leaves the screen loading forever.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(
      0,
      controller.signal.aborted
        ? 'Сервер долго не отвечает, попробуйте ещё раз'
        : 'Нет соединения с сервером',
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      extractError(data, `Ошибка сервера (${response.status})`),
      data,
    );
  }

  return data as T;
}

// ---- Типы ответов API (подмножество полей, которые использует приложение) ----

export type UserRole = 'CUSTOMER' | 'PROVIDER_ADMIN' | 'PROVIDER_OPERATOR' | 'ADMIN';

export interface ApiUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  /** Дата подтверждения e-mail; null — не подтверждён. Отдаёт GET /api/mobile/me. */
  emailVerified?: string | null;
}

export type EquipmentStatus = 'AVAILABLE' | 'RENTED' | 'IN_MAINTENANCE' | 'RETIRED';

export interface Equipment {
  id: string;
  name: string;
  make: string | null;
  model: string | null;
  year: number | null;
  status: EquipmentStatus | string;
  /** Смена 8 часов. Если задан hourlyRate — второстепенная цена. */
  dailyRate: string | number;
  /** Цена за машино-час — главная цена на сайте; null, если не задана. */
  hourlyRate?: string | number | null;
  weeklyRate: string | number | null;
  monthlyRate: string | number | null;
  currency: string;
  specs: Record<string, unknown> | null;
  description: string | null;
  imageUrls: string[];
  /** Фото для карточки: своё или пример по типу машины (абсолютная ссылка). */
  photoUrl?: string | null;
  /** true — «Фото для примера», не эта машина. */
  photoIsExample?: boolean;
  category: { id: string; name: string };
  company: { id: string; name: string };
  location: { city: string; address?: string | null } | null;
}

export interface EquipmentListResponse {
  equipment: Equipment[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED' | string;

export interface Booking {
  id: string;
  /** Заявка, по которой создана бронь (если бронь из предложения). */
  orderId?: string | null;
  status: BookingStatus;
  startDate: string;
  endDate: string;
  totalPrice: string | number;
  currency: string;
  depositPaid: boolean;
  notes: string | null;
  createdAt: string;
  equipment: { id: string; name: string; imageUrls?: string[]; companyId?: string };
  /** Исполнитель: название всегда, телефон — после подтверждения брони. */
  provider?: { name: string; phone: string | null };
  payment?: { status: PaymentStatus; refundRequired?: boolean } | null;
  review?: { id: string; rating: number } | null;
}

export type OrderStatus = 'OPEN' | 'MATCHED' | 'CANCELLED';
export type BidStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

export interface Category {
  id: string;
  name: string;
}

export interface Bid {
  id: string;
  orderId?: string;
  price: string | number;
  currency: string;
  message: string | null;
  status: BidStatus;
  createdAt: string;
  equipmentId: string;
  /** Разбивка цены: подача + смена × смен (может отсутствовать). */
  deliveryPrice?: string | number | null;
  shiftPrice?: string | number | null;
  shifts?: number | null;
  optionsNote?: string | null;
  equipment?: {
    id: string;
    name: string;
    imageUrls?: string[];
    /** rating и verified — если сервер начнёт их отдавать; сейчас их нет. */
    company: { id: string; name: string; rating?: number | null; verified?: boolean };
  };
}

export interface Order {
  id: string;
  description: string;
  desiredStartDate: string;
  desiredEndDate: string;
  status: OrderStatus;
  createdAt: string;
  /** Только у автора заявки: исполнителю id заказчика не отдаётся. */
  customerId?: string;
  category: Category | null;
  /** Исполнитель видит заказчика как «Анна П.». */
  customer?: { id?: string; name: string } | null;
  bids: Bid[];
  /** Сколько всего предложений (исполнитель видит в bids только свои). */
  bidCount?: number;
  /** Место работ; у старых заявок адрес может быть строкой «Адрес:» в описании. */
  location?: {
    addressLine?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
  /** Непрочитанные сообщения в чатах по заявке (для бейджей). */
  unreadMessages?: number;
  /** До какого момента заказчик ждёт предложений (lib/bidWindow.ts на сервере). */
  bidsUntil?: string | null;
  /** Заявка из чата или с сайта без входа: телефон автора скрыт, «Показать телефон» открывает его. */
  chatContact?: { maskedPhone: string | null; canReveal: boolean } | null;
}

/**
 * Бронирование техники поставщика (GET /api/bookings?as=provider): заказчик как
 * «Анна П.»; телефон и e-mail — только после подтверждения брони.
 */
export interface ProviderBooking extends Booking {
  /** Назначенный машинист (см. /api/operators/assign). */
  operatorId?: string | null;
  customer: {
    id: string;
    name: string;
    email: string | null;
    phone?: string | null;
    contactsVisible?: boolean;
  };
  /** Непрочитанные сообщения заказчика в чате по заявке брони. */
  unreadMessages?: number;
}

export interface UploadedFile {
  url: string;
  contentType: string;
  size: number;
}

export type SpecValue = string | number | boolean;

export interface ExtractedSpecs {
  make?: string;
  model?: string;
  year?: number;
  specs: Record<string, SpecValue>;
}

export interface CreateEquipmentInput {
  name: string;
  categoryId: string;
  make?: string;
  model?: string;
  year?: number;
  dailyRate: number;
  hourlyRate?: number;
  description?: string;
  specs?: Record<string, unknown>;
  imageUrls: string[];
  status?: EquipmentStatus;
}

/** PATCH /api/equipment/[id]: null очищает необязательное поле. */
export interface UpdateEquipmentInput {
  name?: string;
  categoryId?: string;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  status?: EquipmentStatus;
  dailyRate?: number;
  hourlyRate?: number | null;
  description?: string | null;
  specs?: Record<string, unknown> | null;
  imageUrls?: string[];
}

/** Заявка на обратный звонок (POST /api/leads, как форма CallbackForm на сайте). */
export interface CreateLeadInput {
  name: string;
  phone: string;
  message?: string;
  /** Откуда пришла заявка, например `mobile:catalog` или `mobile:equipment:<id>`. */
  source?: string;
}

export interface ChatMessage {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: string;
}

// ---- Вызовы ----

export function login(email: string, password: string) {
  return apiFetch<{ token: string; user: ApiUser }>('/api/mobile/login', {
    method: 'POST',
    body: { email, password },
    anonymous: true,
  });
}

export function fetchMe() {
  return apiFetch<{ user: ApiUser }>('/api/mobile/me');
}

export function fetchEquipment(params: { query?: string; page?: number; pageSize?: number }) {
  const search = new URLSearchParams();
  if (params.query) search.set('query', params.query);
  search.set('page', String(params.page ?? 1));
  search.set('pageSize', String(params.pageSize ?? 20));
  return apiFetch<EquipmentListResponse>(`/api/equipment?${search.toString()}`, {
    anonymous: true,
  });
}

export function fetchEquipmentById(id: string) {
  return apiFetch<{ equipment: Equipment }>(`/api/equipment/${encodeURIComponent(id)}`, {
    anonymous: true,
  });
}

/** Заказ обратного звонка — доступен без входа. `consent` обязателен (152-ФЗ). */
export function createLead(input: CreateLeadInput) {
  return apiFetch<{ ok: boolean }>('/api/leads', {
    method: 'POST',
    body: {
      name: input.name,
      phone: input.phone,
      message: input.message || undefined,
      source: input.source,
      consent: true,
    },
    anonymous: true,
  });
}

export type RegisterInput = {
  name: string;
  email: string;
  password: string;
  phone?: string;
  consent: true;
} & (
  | { accountType: 'CUSTOMER' }
  | { accountType: 'PROVIDER'; companyName: string; baseAddress: string }
);

/** Регистрация заказчика или исполнителя (с компанией и адресом базы). */
export function register(input: RegisterInput) {
  return apiFetch<{ id: string; email: string }>('/api/auth/register', {
    method: 'POST',
    body: input,
    anonymous: true,
  });
}

export function sendVerificationEmail() {
  return apiFetch<{ ok: boolean; alreadyVerified?: boolean }>('/api/auth/send-verification', {
    method: 'POST',
  });
}

export function fetchMyBookings() {
  // paymentsEnabled: подключена ли онлайн-оплата (старый сервер поле не отдаёт).
  return apiFetch<{ bookings: Booking[]; paymentsEnabled?: boolean }>('/api/bookings');
}

/** Создаёт Stripe Checkout для PENDING-бронирования и возвращает ссылку на оплату. */
export function createCheckout(bookingId: string) {
  return apiFetch<{ url: string }>(`/api/bookings/${encodeURIComponent(bookingId)}/checkout`, {
    method: 'POST',
  });
}

export function createReview(input: { bookingId: string; rating: number; comment?: string }) {
  return apiFetch<{ review: { id: string } }>('/api/reviews', { method: 'POST', body: input });
}

export function fetchCategories() {
  return apiFetch<{ categories: Category[] }>('/api/categories', { anonymous: true });
}

export function fetchMyOrders() {
  // Без параметров роут отдаёт заявки текущего пользователя (с ?open=1 — ленту открытых).
  return apiFetch<{ orders: Order[] }>('/api/orders');
}

export function fetchOrderById(id: string) {
  return apiFetch<{ order: Order; isOwner: boolean }>(`/api/orders/${encodeURIComponent(id)}`);
}

export function createOrder(input: {
  description: string;
  desiredStartDate: string;
  desiredEndDate: string;
  categoryId?: string;
  /** Адрес объекта: сервер геокодирует его для погоды и карты. */
  address?: string;
}) {
  return apiFetch<{ order: Order }>('/api/orders', { method: 'POST', body: input });
}

/** Заказчик отменяет свою открытую заявку. */
export function cancelOrder(id: string) {
  return apiFetch<{ ok: boolean; message?: string }>(`/api/orders/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { status: 'CANCELLED' },
  });
}

export function acceptBid(bidId: string) {
  return apiFetch<{ booking: Booking }>(`/api/bids/${encodeURIComponent(bidId)}/accept`, {
    method: 'POST',
  });
}

export function createBooking(input: { equipmentId: string; startDate: string; endDate: string }) {
  return apiFetch<{ booking: Booking }>('/api/bookings', { method: 'POST', body: input });
}

export function cancelBooking(id: string) {
  return apiFetch<{ booking: Booking }>(`/api/bookings/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { status: 'CANCELLED' },
  });
}

export function fetchConversation(conversationId: string) {
  return apiFetch<{ conversationId: string; messages: ChatMessage[] }>(
    `/api/ai/chat?conversationId=${encodeURIComponent(conversationId)}`,
  );
}

/** Диспетчер сайта (как виджет чата на сайте): история диалога → ответ. */
export function sendAgentMessage(messages: { role: 'user' | 'assistant'; content: string }[]) {
  return apiFetch<{ agentId: string; reply: string; offline?: boolean }>('/api/ai/agents', {
    method: 'POST',
    body: { agentId: 'auto', messages },
  });
}

// ---- Сторона поставщика (роль PROVIDER_ADMIN) ----

/**
 * Своя машина для формы правки: с токеном, в любом статусе и с ценами из
 * базы (публичная карточка отдаёт цены по прайсу, их нельзя сохранять).
 */
export function fetchMyEquipmentById(id: string) {
  return apiFetch<{ equipment: Equipment }>(`/api/equipment/${encodeURIComponent(id)}?mine=1`);
}

/** Техника компании текущего поставщика. */
export function fetchMyEquipment(params: { page?: number; pageSize?: number } = {}) {
  const search = new URLSearchParams({ mine: '1' });
  search.set('page', String(params.page ?? 1));
  search.set('pageSize', String(params.pageSize ?? 100));
  return apiFetch<EquipmentListResponse>(`/api/equipment?${search.toString()}`);
}

export function fetchProviderBookings() {
  return apiFetch<{ bookings: ProviderBooking[] }>('/api/bookings?as=provider');
}

export function updateBookingStatus(id: string, status: BookingStatus) {
  return apiFetch<{ booking: Booking }>(`/api/bookings/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { status },
  });
}

export function createEquipment(input: CreateEquipmentInput) {
  return apiFetch<{ equipment: Equipment }>('/api/equipment', { method: 'POST', body: input });
}

export function updateEquipment(id: string, input: UpdateEquipmentInput) {
  return apiFetch<{ equipment: Equipment; message?: string }>(
    `/api/equipment/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: input },
  );
}

export function extractSpecsFromFile(fileUrl: string) {
  return apiFetch<ExtractedSpecs>('/api/ai/extract-specs', { method: 'POST', body: { fileUrl } });
}

/**
 * Загрузка файла в хранилище: multipart/form-data с полем `file`.
 * В React Native в FormData кладётся объект { uri, name, type } — заголовок
 * Content-Type с boundary выставляет сам fetch.
 */
export async function uploadFile(file: { uri: string; name: string; type: string }) {
  const formData = new FormData();
  formData.append('file', file as unknown as Blob);

  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/uploads`, {
      method: 'POST',
      headers: { Accept: 'application/json', ...(await authHeaders()) },
      body: formData,
    });
  } catch {
    throw new ApiError(0, 'Нет соединения с сервером');
  }

  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    throw new ApiError(response.status, extractError(data, 'Не удалось загрузить файл'), data);
  }
  return data as UploadedFile;
}

// ---- Карта исполнителей ----

/** Точка поставщика на карте (/map) — GET/PATCH /api/companies/me. */
export interface CompanyPin {
  id: string;
  name: string;
  baseLat: number | null;
  baseLon: number | null;
  baseAddress: string | null;
  pinImageUrl: string | null;
  pinNote: string | null;
  /** Радиус выезда от базы, км, и цена подачи за км (null — не задана). */
  deliveryRadiusKm?: number;
  deliveryPricePerKm?: string | number | null;
}

export function fetchMyCompanyPin() {
  return apiFetch<{ company: CompanyPin; photos: string[]; uploadsEnabled: boolean }>(
    '/api/companies/me',
  );
}

export function updateMyCompanyPin(input: {
  baseAddress?: string;
  pinImageUrl?: string | null;
  pinNote?: string;
  deliveryRadiusKm?: number;
  deliveryPricePerKm?: number | null;
}) {
  return apiFetch<{ company: CompanyPin }>('/api/companies/me', { method: 'PATCH', body: input });
}

/** Открытые заявки клиентов (для предложений поставщика). */
export function fetchOpenOrders() {
  return apiFetch<{ orders: Order[] }>('/api/orders?open=1');
}

export function createBid(
  orderId: string,
  input: {
    equipmentId: string;
    price: number;
    message?: string;
    /** Разбивка: подача + цена смены × смен; сервер проверяет, что сумма равна price. */
    deliveryPrice?: number;
    shiftPrice?: number;
    shifts?: number;
    optionsNote?: string;
  },
) {
  // 201 — новое предложение, 200 — обновлено прежнее (одно предложение от компании).
  // late: предложение после срока приёма (всё равно принято).
  return apiFetch<{ bid: Bid; message?: string; late?: boolean }>(
    `/api/orders/${encodeURIComponent(orderId)}/bids`,
    {
      method: 'POST',
      body: input,
    },
  );
}

// ---- Комментарии (с модерацией) и помощник «Что дальше?» ----

/** Опубликованный комментарий: без контактов, имя автора сокращено («Иван П.»). */
export interface PublicComment {
  id: string;
  text: string;
  createdAt: string;
  authorName: string;
  authorCompany: string | null;
}

export type CommentTarget = { companyId: string } | { userId: string };

export function fetchComments(target: CommentTarget) {
  const query =
    'companyId' in target
      ? `companyId=${encodeURIComponent(target.companyId)}`
      : `userId=${encodeURIComponent(target.userId)}`;
  return apiFetch<{ comments: PublicComment[]; canComment: boolean }>(`/api/comments?${query}`);
}

/** Комментарий уходит на модерацию; в ответе — текст «Комментарий отправлен на проверку». */
export function createComment(target: CommentTarget, text: string) {
  return apiFetch<{ comment: { id: string; status: string }; message: string }>('/api/comments', {
    method: 'POST',
    body: {
      text,
      ...('companyId' in target
        ? { targetCompanyId: target.companyId }
        : { targetUserId: target.userId }),
    },
  });
}

export interface GuideLink {
  label: string;
  href: string;
  /** Маршрут приложения (expo-router). */
  app?: string;
}

export interface GuideStep {
  id: string;
  title: string;
  hint: string;
  done: boolean;
  action?: GuideLink;
}

export interface Guide {
  role: 'GUEST' | 'CUSTOMER' | 'PROVIDER';
  title: string;
  steps: GuideStep[];
  next: GuideStep;
  progress: { done: number; total: number };
  /** Ответ на «Что дальше?» текстом для чата. */
  reply: string;
}

export function fetchGuide() {
  return apiFetch<Guide>('/api/guide?links=plain');
}

// ---- Чат по заявке (заказчик ↔ исполнитель, одна переписка на компанию) ----

export interface OrderThread {
  id: string;
  orderId: string;
  companyId: string;
  companyName: string;
  lastMessageAt: string;
  /** Контакты открыты (бронь подтверждена) — иначе телефоны и ссылки скрываются. */
  contactsOpen: boolean;
  unread?: number;
  lastMessage?: { body: string; createdAt: string } | null;
}

export interface OrderThreadView {
  id: string;
  orderId: string;
  companyId: string;
  role: 'customer' | 'provider' | 'admin';
  canWrite: boolean;
  contactsOpen: boolean;
  /** Собеседник: заказчику — компания, исполнителю — «Анна П.». */
  counterpart: string;
  /** «Контакты откроются после подтверждения брони», пока они скрыты. */
  notice: string | null;
}

export interface OrderChatMessage {
  id: string;
  body: string;
  attachmentUrl: string | null;
  createdAt: string;
  /** Написано нашей стороной (заказчиком или нашей компанией). */
  mine: boolean;
  readAt: string | null;
}

/** Переписки по заявке: заказчик видит все (по компаниям), исполнитель — свою. */
export function fetchOrderThreads(orderId: string) {
  return apiFetch<{
    threads: OrderThread[];
    companies: { id: string; name: string; contactsOpen: boolean }[];
  }>(`/api/orders/${encodeURIComponent(orderId)}/threads`);
}

/** Открывает (или находит) переписку: заказчик указывает компанию, исполнитель — нет. */
export function openOrderThread(orderId: string, companyId?: string) {
  return apiFetch<{ thread: OrderThread & { role: OrderThreadView['role'] } }>(
    `/api/orders/${encodeURIComponent(orderId)}/threads`,
    { method: 'POST', body: companyId ? { companyId } : {} },
  );
}

/** Сообщения (старые сверху). `cursor` — страница раньше сообщения, `after` — новее него. */
export function fetchThreadMessages(
  threadId: string,
  params: { cursor?: string; after?: string } = {},
) {
  const search = new URLSearchParams();
  if (params.cursor) search.set('cursor', params.cursor);
  if (params.after) search.set('after', params.after);
  const query = search.toString();
  return apiFetch<{
    thread: OrderThreadView;
    messages: OrderChatMessage[];
    nextCursor: string | null;
  }>(`/api/threads/${encodeURIComponent(threadId)}/messages${query ? `?${query}` : ''}`);
}

/** Отправка; `masked` — сервер скрыл контакты (бронь ещё не подтверждена). */
export function sendThreadMessage(threadId: string, body: string) {
  return apiFetch<{ message: OrderChatMessage; masked: boolean; notice: string | null }>(
    `/api/threads/${encodeURIComponent(threadId)}/messages`,
    { method: 'POST', body: { body } },
  );
}

export function markThreadRead(threadId: string) {
  return apiFetch<{ ok: boolean; read: number }>(
    `/api/threads/${encodeURIComponent(threadId)}/read`,
    { method: 'POST' },
  );
}

// ---- Документы исполнителя, телефон заявки, спрос ----

export type DocumentStatus = 'ok' | 'expiring' | 'expired' | 'none';

/** Документ компании, машины или машиниста (GET /api/documents). */
export interface ProviderDocument {
  id: string;
  kind: string;
  number: string | null;
  equipmentId: string | null;
  operatorName: string | null;
  fileUrl: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  status: DocumentStatus;
}

export interface DocumentsSummary {
  expired: number;
  expiring: number;
  total: number;
}

export function fetchMyDocuments(equipmentId?: string) {
  const query = equipmentId ? `?equipmentId=${encodeURIComponent(equipmentId)}` : '';
  return apiFetch<{ documents: ProviderDocument[]; summary: DocumentsSummary }>(
    `/api/documents${query}`,
  );
}

export interface DocumentInput {
  kind: string;
  equipmentId?: string | null;
  operatorName?: string | null;
  number?: string | null;
  fileUrl?: string | null;
  /** YYYY-MM-DD или null. */
  issuedAt?: string | null;
  expiresAt?: string | null;
}

export function createDocument(input: DocumentInput) {
  return apiFetch<{ document: ProviderDocument }>('/api/documents', {
    method: 'POST',
    body: input,
  });
}

export function updateDocument(id: string, input: Partial<DocumentInput>) {
  return apiFetch<{ document: ProviderDocument }>(`/api/documents/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
  });
}

export function deleteDocument(id: string) {
  return apiFetch<{ ok: boolean }>(`/api/documents/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

/** «Показать телефон» заявки из чата или с сайта: показ записывается, лимит в сутки. */
export function revealOrderPhone(orderId: string) {
  return apiFetch<{ phone: string | null; name: string | null; note?: string }>(
    `/api/orders/${encodeURIComponent(orderId)}/phone`,
    { method: 'POST' },
  );
}

/** Все непрочитанные сообщения пользователя — бейдж на вкладке заказов. */
export function fetchUnreadMessages() {
  return apiFetch<{ unread: number }>('/api/threads/unread');
}

export type DemandLevel = 'low' | 'medium' | 'high';

/** Индикатор спроса (GET /api/demand): по видам техники и по городам за 14 дней. */
export interface DemandSummary {
  categories: {
    categoryId: string;
    name: string;
    orders: number;
    upcoming: number;
    supply: number;
    level: DemandLevel;
  }[];
  cities: {
    city: string;
    lat: number;
    lon: number;
    orders: number;
    supply: number;
    level: DemandLevel;
    topCategory: string | null;
  }[];
  labels: Record<DemandLevel, string>;
  colors: Record<DemandLevel, string>;
  providerText: string | null;
}

export function fetchDemand() {
  return apiFetch<DemandSummary>('/api/demand', { anonymous: true });
}

// ---- Смены машиниста, табель, машинисты, календарь занятости ----

export type ShiftStatus = 'PLANNED' | 'EN_ROUTE' | 'ON_SITE' | 'WORKING' | 'IDLE' | 'FINISHED';
export type TimesheetState = 'none' | 'waiting' | 'disputed' | 'final';

export interface ShiftEvent {
  id: string;
  kind: ShiftStatus | string;
  label: string;
  at: string;
  note: string | null;
  photoUrl: string | null;
}

export interface Timesheet {
  id: string;
  shiftId: string;
  hoursWorked: string;
  idleHours: string;
  note: string | null;
  customerConfirmedAt: string | null;
  providerConfirmedAt: string | null;
  disputedAt: string | null;
  disputeNote: string | null;
  state: TimesheetState;
  updatedAt: string;
}

/** Смена по брони (GET /api/shifts): статусы с отметками времени, таймер, табель. */
export interface Shift {
  id: string;
  bookingId: string;
  /** YYYY-MM-DD */
  date: string;
  status: ShiftStatus | string;
  statusLabel: string;
  startedAt: string | null;
  arrivedAt: string | null;
  workStartedAt: string | null;
  finishedAt: string | null;
  startPhotoUrl: string | null;
  endPhotoUrl: string | null;
  operator: { id: string; name: string } | null;
  events: ShiftEvent[];
  workedMinutes: number;
  idleMinutes: number;
  workedLabel: string;
  idleLabel: string;
  /** Статусы, в которые можно перейти. */
  next: ShiftStatus[];
  timesheet: Timesheet | null;
}

export type ShiftRole = 'customer' | 'provider' | 'operator';

/**
 * Бронь глазами машиниста: без цен и имени заказчика; адрес объекта и
 * телефон контакта на объекте — только у подтверждённой/активной брони.
 */
export interface OperatorBooking {
  id: string;
  status: BookingStatus;
  startDate: string;
  endDate: string;
  equipment: { id: string; name: string; imageUrls: string[] };
  siteAddress: string | null;
  contactPhone: string | null;
  notes: string | null;
  shifts: Shift[];
}

export function fetchBookingShifts(bookingId: string) {
  return apiFetch<{ role: ShiftRole; shifts: Shift[] }>(
    `/api/shifts?bookingId=${encodeURIComponent(bookingId)}`,
  );
}

/** Брони, назначенные машинисту, со сменами. */
export function fetchMyAssignments() {
  return apiFetch<{ operator: { name: string; active: boolean }; bookings: OperatorBooking[] }>(
    '/api/shifts?mine=1',
  );
}

/** Открыть смену на день (по умолчанию сегодня); повтор вернёт уже открытую. */
export function openShift(bookingId: string, date?: string) {
  return apiFetch<{ shift: Shift }>('/api/shifts', { method: 'POST', body: { bookingId, date } });
}

export function transitionShift(
  shiftId: string,
  input: { status: ShiftStatus; note?: string; photoUrl?: string },
) {
  return apiFetch<{ shift: Shift }>(`/api/shifts/${encodeURIComponent(shiftId)}`, {
    method: 'PATCH',
    body: input,
  });
}

export function submitTimesheet(input: {
  shiftId: string;
  hoursWorked: number;
  idleHours: number;
  note?: string;
}) {
  return apiFetch<{ shift: Shift }>('/api/timesheets', { method: 'POST', body: input });
}

export function reviewTimesheet(
  timesheetId: string,
  input: { action: 'confirm' | 'dispute'; note?: string },
) {
  return apiFetch<{ shift: Shift }>(`/api/timesheets/${encodeURIComponent(timesheetId)}`, {
    method: 'PATCH',
    body: input,
  });
}

/** Доход за месяц по каждой машине (GET /api/shifts/income). */
export interface MachineIncomeReport {
  month: string;
  total: number;
  machines: {
    equipmentId: string;
    name: string;
    income: number;
    bookings: number;
    confirmedHours: number;
  }[];
}

export function fetchMachineIncome() {
  return apiFetch<MachineIncomeReport>('/api/shifts/income');
}

export interface Operator {
  id: string;
  name: string;
  phone: string | null;
  licenseNumber: string | null;
  active: boolean;
  /** E-mail для входа в приложение, если администратор его создал. */
  email: string | null;
  createdAt: string;
}

export interface OperatorInput {
  name?: string;
  phone?: string;
  licenseNumber?: string;
  active?: boolean;
  email?: string;
  password?: string;
}

export function fetchOperators() {
  return apiFetch<{ operators: Operator[] }>('/api/operators');
}

export function createOperator(input: OperatorInput & { name: string }) {
  return apiFetch<{ operator: Operator }>('/api/operators', { method: 'POST', body: input });
}

export function updateOperator(id: string, input: OperatorInput) {
  return apiFetch<{ operator: Operator }>(`/api/operators/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
  });
}

/** Назначить машиниста на бронь (null — снять). */
export function assignOperator(bookingId: string, operatorId: string | null) {
  return apiFetch<{ bookingId: string; operator: { id: string; name: string } | null }>(
    '/api/operators/assign',
    { method: 'POST', body: { bookingId, operatorId } },
  );
}

export type CalendarDayKind = 'free' | 'booked' | 'pending' | 'blocked' | 'maintenance';

export interface CalendarDay {
  date: string;
  kind: CalendarDayKind;
  bookingId?: string;
  blockId?: string;
  past: boolean;
}

export interface MachineCalendar {
  equipment: { id: string; name: string; status: string };
  year: number;
  month: number;
  days: CalendarDay[];
  summary: Record<CalendarDayKind, number>;
  nextFree: string | null;
  bookings: {
    id: string;
    status: BookingStatus;
    startDate: string;
    endDate: string;
    customer: string;
    totalPrice: string;
    currency: string;
    operator: { id: string; name: string } | null;
  }[];
  blocks: { id: string; from: string; to: string; reason: string | null }[];
}

/** Календарь занятости машины за месяц (`month` — YYYY-MM). */
export function fetchMachineCalendar(equipmentId: string, month?: string) {
  const query = month ? `?month=${encodeURIComponent(month)}` : '';
  return apiFetch<MachineCalendar>(
    `/api/equipment/${encodeURIComponent(equipmentId)}/calendar${query}`,
  );
}

export function createEquipmentBlock(
  equipmentId: string,
  input: { from: string; to: string; reason?: string },
) {
  return apiFetch<{ block: MachineCalendar['blocks'][number] }>(
    `/api/equipment/${encodeURIComponent(equipmentId)}/blocks`,
    { method: 'POST', body: input },
  );
}

export function deleteEquipmentBlock(equipmentId: string, blockId: string) {
  return apiFetch<{ ok: true }>(
    `/api/equipment/${encodeURIComponent(equipmentId)}/blocks/${encodeURIComponent(blockId)}`,
    { method: 'DELETE' },
  );
}
