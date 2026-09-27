import { STORAGE_KEYS, getItem } from './storage';

/**
 * Базовый URL API. Задаётся через EXPO_PUBLIC_API_URL (например,
 * https://specplast16.ru). Сайт СпецПласт16 и API живут на одном хосте. Без завершающего слэша.
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000').replace(
  /\/+$/,
  '',
);

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

/** fetch к API с JSON-телом и Bearer-токеном из SecureStore. */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (!options.anonymous) Object.assign(headers, await authHeaders());

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Нет соединения с сервером');
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

export type UserRole = 'CUSTOMER' | 'PROVIDER_ADMIN' | 'ADMIN';

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
  status: BookingStatus;
  startDate: string;
  endDate: string;
  totalPrice: string | number;
  currency: string;
  depositPaid: boolean;
  notes: string | null;
  createdAt: string;
  equipment: { id: string; name: string; imageUrls?: string[] };
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
  equipment?: {
    id: string;
    name: string;
    imageUrls?: string[];
    company: { id: string; name: string };
  };
}

export interface Order {
  id: string;
  description: string;
  desiredStartDate: string;
  desiredEndDate: string;
  status: OrderStatus;
  createdAt: string;
  customerId: string;
  category: Category | null;
  customer?: { id: string; name: string };
  bids: Bid[];
}

/** Бронирование техники поставщика (GET /api/bookings?as=provider). */
export interface ProviderBooking extends Booking {
  customer: { id: string; name: string; email: string };
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

export function register(input: { name: string; email: string; password: string; phone?: string }) {
  return apiFetch<{ id: string; email: string }>('/api/auth/register', {
    method: 'POST',
    body: { accountType: 'CUSTOMER', ...input },
    anonymous: true,
  });
}

export function sendVerificationEmail() {
  return apiFetch<{ ok: boolean; alreadyVerified?: boolean }>('/api/auth/send-verification', {
    method: 'POST',
  });
}

export function fetchMyBookings() {
  return apiFetch<{ bookings: Booking[] }>('/api/bookings');
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
}) {
  return apiFetch<{ order: Order }>('/api/orders', { method: 'POST', body: input });
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

// ---- Сторона поставщика (роль PROVIDER_ADMIN) ----

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

/** Открытые заявки клиентов (для предложений поставщика). */
export function fetchOpenOrders() {
  return apiFetch<{ orders: Order[] }>('/api/orders?open=1');
}

export function createBid(
  orderId: string,
  input: { equipmentId: string; price: number; message?: string },
) {
  return apiFetch<{ bid: Bid }>(`/api/orders/${encodeURIComponent(orderId)}/bids`, {
    method: 'POST',
    body: input,
  });
}
