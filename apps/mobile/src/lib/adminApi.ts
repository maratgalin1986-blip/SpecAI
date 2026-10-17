import { ApiError, apiFetch } from './api';
import { clearAdminSession, getAdminSession, saveAdminSession } from './adminSession';

/**
 * Запросы меню администратора: тот же сервер и те же ошибки, что в api.ts,
 * но вместо токена аккаунта — сессия админки в заголовке x-admin-session
 * (apps/web/src/lib/admin.ts). Cookie не принимаем и не отправляем: на
 * iPhone они сохранялись бы между запросами и пережили бы «Выйти из админки».
 */
export const ADMIN_SESSION_HEADER = 'x-admin-session';

/** Текст над полем пароля, когда сервер перестал принимать сессию. */
export const ADMIN_EXPIRED_MESSAGE = 'Вход в меню администратора истёк. Введите пароль ещё раз';

interface AdminRequestOptions {
  method?: 'GET' | 'PATCH' | 'PUT';
  body?: unknown;
}

/**
 * fetch к /api/admin/* с сессией. 401 — сессия больше не действует (сменили
 * пароль или вход не выполнен): забываем её, и экраны снова просят пароль.
 */
export async function adminFetch<T>(path: string, options: AdminRequestOptions = {}): Promise<T> {
  const session = await getAdminSession();
  if (!session) throw new ApiError(401, ADMIN_EXPIRED_MESSAGE);
  try {
    return await apiFetch<T>(path, {
      ...options,
      anonymous: true,
      credentials: 'omit',
      headers: { [ADMIN_SESSION_HEADER]: session },
    });
  } catch (caught) {
    if (caught instanceof ApiError && caught.status === 401) {
      // Пока шёл запрос, владелец мог войти заново — новую сессию не трогаем.
      if ((await getAdminSession()) === session) await clearAdminSession(ADMIN_EXPIRED_MESSAGE);
      throw new ApiError(401, ADMIN_EXPIRED_MESSAGE, caught.details);
    }
    throw caught;
  }
}

/**
 * Вход по паролю администратора. Ошибки сервера («Неверный пароль», «Слишком
 * много попыток…») приходят как есть в ApiError.message.
 */
export async function adminLogin(password: string): Promise<void> {
  const result = await apiFetch<{ ok?: boolean; session?: string } | null>('/api/admin/login', {
    method: 'POST',
    body: { password, app: true },
    anonymous: true,
    credentials: 'omit',
  });
  if (!result?.session) {
    throw new ApiError(0, 'Не удалось войти, попробуйте позже');
  }
  await saveAdminSession(result.session);
}

// ---- Ответы /api/admin/* (подмножество полей) ----

export interface SignupCounts {
  total: number;
  today: number;
  week: number;
  month: number;
}

export interface AdminStats {
  customers: SignupCounts;
  providers: SignupCounts;
  operators: number;
  providerCompanies: number;
  machines: number;
  openOrders: number;
  activeBookings: number;
  /** Заявки из чатов на модерации (нет в ответе старого сервера). */
  chatOrders?: number;
  moderation: { reviews: number; comments: number };
  generatedAt: string;
}

export interface PendingReview {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  author: { name: string; email: string };
  company: { name: string };
  equipment: { name: string } | null;
}

export interface PendingComment {
  id: string;
  text: string;
  createdAt: string;
  author: { name: string; email: string };
  targetCompany: { name: string } | null;
  targetUser: { name: string } | null;
}

export type ModerationDecision = 'APPROVED' | 'REJECTED';

export interface ChatOrder {
  id: string;
  status: string;
  description: string;
  rawText: string | null;
  source: string;
  sourceChat: string | null;
  sourceUrl: string | null;
  contactName: string | null;
  contactPhone: string | null;
  desiredStartDate: string;
  createdAt: string;
  category: { name: string } | null;
  location: { city: string } | null;
}

export interface AdminCompany {
  id: string;
  name: string;
  phone: string | null;
  verified: boolean;
  createdAt: string;
  machines: number;
  isHouse: boolean;
}

export async function fetchAdminStats() {
  return (await adminFetch<{ stats: AdminStats }>('/api/admin/stats')).stats;
}

export function fetchModeration() {
  return adminFetch<{ reviews: PendingReview[]; comments: PendingComment[] }>(
    '/api/admin/moderation',
  );
}

export function moderateReview(id: string, status: ModerationDecision) {
  return adminFetch(`/api/admin/reviews/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { status },
  });
}

export function moderateComment(id: string, status: ModerationDecision) {
  return adminFetch(`/api/admin/comments/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { status },
  });
}

export async function fetchChatOrders() {
  return (await adminFetch<{ orders: ChatOrder[] }>('/api/admin/orders')).orders;
}

/** OPEN — опубликовать заявку из чата, CANCELLED — отклонить. */
export function moderateOrder(id: string, status: 'OPEN' | 'CANCELLED') {
  return adminFetch(`/api/admin/orders/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { status },
  });
}

export async function fetchAdminCompanies() {
  return (await adminFetch<{ companies: AdminCompany[] }>('/api/admin/companies')).companies;
}

export function setCompanyVerified(id: string, verified: boolean) {
  return adminFetch(`/api/admin/companies/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { verified },
  });
}

/** «Поддержка (донаты)»: номер карты владельца, имя получателя, вкл/выкл. */
export interface AdminSupportSettings {
  /** Только цифры, '' — не задан. */
  card: string;
  cardFormatted: string;
  recipient: string;
  enabled: boolean;
  updatedAt: string | null;
}

export async function fetchSupportSettings() {
  return (await adminFetch<{ support: AdminSupportSettings }>('/api/admin/settings/support'))
    .support;
}

export async function saveSupportSettings(value: {
  card: string;
  recipient: string;
  enabled: boolean;
}) {
  return (
    await adminFetch<{ support: AdminSupportSettings }>('/api/admin/settings/support', {
      method: 'PUT',
      body: value,
    })
  ).support;
}
