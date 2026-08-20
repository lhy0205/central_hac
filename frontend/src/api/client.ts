import * as SecureStore from "expo-secure-store";
import { getApiBaseUrl } from "../config/serverAddress";
type Options = RequestInit & { auth?: boolean };
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
let unauthorizedHandler: (() => void) | undefined;
export function onUnauthorized(handler: () => void) {
  unauthorizedHandler = handler;
  return () => {
    if (unauthorizedHandler === handler) unauthorizedHandler = undefined;
  };
}
export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const API_URL = await getApiBaseUrl();
  if (!API_URL) throw new Error("API_BASE_URL_NOT_CONFIGURED");
  const token = options.auth === false ? null : await SecureStore.getItemAsync("accessToken");
  if (token === "mcm-care-demo")
    throw new ApiError("DEMO_MODE", "체험 모드에서는 서버 데이터를 사용하지 않습니다.", 0);
  const controller = new AbortController();

  const timeoutMs = options.body instanceof FormData ? 60000 : 8000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch (error) {
    if ((error as Error)?.name === "AbortError")
      throw new ApiError("NETWORK_TIMEOUT", "서버 응답 시간이 초과되었습니다.", 0);
    throw new ApiError("NETWORK_ERROR", "서버에 연결할 수 없습니다.", 0);
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    const text = await response.text();
    let parsed: { code?: string; message?: string } = {};
    try {
      parsed = JSON.parse(text);
    } catch {}
    const error = new ApiError(
      parsed.code || `HTTP_${response.status}`,
      parsed.message || text || "요청을 처리하지 못했습니다.",
      response.status,
    );
    if (response.status === 401 && options.auth !== false && token !== "mcm-care-demo") {
      await SecureStore.deleteItemAsync("accessToken");
      unauthorizedHandler?.();
    }
    throw error;
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function jsonPart(value: object) {
  return JSON.stringify(value) as unknown as Blob;
}
export const authApi = {
  login: (body: { email: string; password: string }) =>
    api<{
      accessToken: string;
      account: { id: number; email: string; nickname: string; createdAt: string };
    }>("/api/auth/login", { method: "POST", auth: false, body: JSON.stringify(body) }),
  signup: (body: { email: string; password: string; nickname: string }) =>
    api<{ id: number; email: string; nickname: string; createdAt: string }>("/api/auth/signup", {
      method: "POST",
      auth: false,
      body: JSON.stringify(body),
    }),
  forgot: (email: string) =>
    api<void>("/api/auth/password-reset", {
      method: "POST",
      auth: false,
      body: JSON.stringify({ email }),
    }),
  resetConfirm: (body: { token: string; newPassword: string }) =>
    api<void>("/api/auth/password-reset/confirm", {
      method: "POST",
      auth: false,
      body: JSON.stringify(body),
    }),
};
export interface PassportSummary {
  id: number;
  modelName: string;
  nickname: string | null;
  ownershipDays: number;
  overallGrade: string | null;
  lastDiagnosedAt: string | null;
}
export interface PassportDetail {
  id: number;
  serialNumber: string;
  purchaseYear: number;
  modelName: string;
  nickname: string | null;
  purchaseDate: string;
  purchasePlace: string | null;
  hasReceiptTag: boolean;
  baselineImageUrls: string[];
  usageFrequency: "DAILY" | "FEW_TIMES_A_WEEK" | "OCCASIONAL" | "RARE";
  status: "ACTIVE" | "DELETED";
  createdAt: string;
}
const DEMO_PASSPORTS_KEY = "demoPassports";
async function isDemo() {
  return (await SecureStore.getItemAsync("accessToken")) === "mcm-care-demo";
}
async function readDemoPassports(): Promise<PassportDetail[]> {
  try {
    return JSON.parse((await SecureStore.getItemAsync(DEMO_PASSPORTS_KEY)) || "[]");
  } catch {
    return [];
  }
}
async function writeDemoPassports(items: PassportDetail[]) {
  await SecureStore.setItemAsync(DEMO_PASSPORTS_KEY, JSON.stringify(items));
}
function demoSummary(item: PassportDetail): PassportSummary {
  return {
    id: item.id,
    modelName: item.modelName,
    nickname: item.nickname,
    ownershipDays: Math.max(
      0,
      Math.floor((Date.now() - new Date(item.purchaseDate).getTime()) / 86400000),
    ),
    overallGrade: null,
    lastDiagnosedAt: null,
  };
}

export const productApi = {
  list: async (page = 0, size = 20, sort?: string) => {
    if (await isDemo()) {
      const all = (await readDemoPassports())
        .filter((item) => item.status === "ACTIVE")
        .map(demoSummary);
      return { content: all.slice(page * size, (page + 1) * size), totalElements: all.length };
    }
    return api<{ content: PassportSummary[]; totalElements: number }>(
      `/api/passports?page=${page}&size=${size}${sort ? `&sort=${encodeURIComponent(sort)}` : ""}`,
    );
  },
  detail: async (id: string) => {
    if (await isDemo()) {
      const item = (await readDemoPassports()).find(
        (entry) => String(entry.id) === id && entry.status === "ACTIVE",
      );
      if (!item) throw new ApiError("PASSPORT_NOT_FOUND", "제품을 찾을 수 없습니다.", 404);
      return item;
    }
    return api<PassportDetail>(`/api/passports/${id}`);
  },
  create: async (
    request: {
      serialNumber: string;
      modelName: string;
      nickname?: string;
      purchaseDate: string;
      purchasePlace?: string;
      usageFrequency: "DAILY" | "FEW_TIMES_A_WEEK" | "OCCASIONAL" | "RARE";
    },
    receiptImage?: { uri: string; name: string; type: string },
    baselineImages: { uri: string; name: string; type: string }[] = [],
  ) => {
    if (await isDemo()) {
      const items = await readDemoPassports();
      if (
        items.some((item) => item.serialNumber === request.serialNumber && item.status === "ACTIVE")
      )
        throw new ApiError("SERIAL_ALREADY_REGISTERED", "이미 등록된 일련번호입니다.", 409);
      const created: PassportDetail = {
        id: Date.now(),
        serialNumber: request.serialNumber,
        purchaseYear: new Date(request.purchaseDate).getFullYear(),
        modelName: request.modelName,
        nickname: request.nickname || null,
        purchaseDate: request.purchaseDate,
        purchasePlace: request.purchasePlace || null,
        hasReceiptTag: Boolean(receiptImage),
        baselineImageUrls: baselineImages.map((image) => image.uri),
        usageFrequency: request.usageFrequency,
        status: "ACTIVE",
        createdAt: new Date().toISOString(),
      };
      await writeDemoPassports([...items, created]);
      return created;
    }
    const data = new FormData();
    data.append("request", jsonPart(request));
    if (receiptImage) data.append("receiptImage", receiptImage as any);
    baselineImages.forEach((image) => data.append("baselineImages", image as any));
    return api<PassportDetail>("/api/passports", { method: "POST", body: data });
  },
  update: async (
    id: string,
    body: {
      nickname?: string;
      usageFrequency?: "DAILY" | "FEW_TIMES_A_WEEK" | "OCCASIONAL" | "RARE";
    },
  ) => {
    if (await isDemo()) {
      const items = await readDemoPassports();
      const index = items.findIndex((item) => String(item.id) === id);
      if (index < 0) throw new ApiError("PASSPORT_NOT_FOUND", "제품을 찾을 수 없습니다.", 404);
      items[index] = { ...items[index], ...body };
      await writeDemoPassports(items);
      return items[index];
    }
    return api<PassportDetail>(`/api/passports/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  remove: async (id: string) => {
    if (await isDemo()) {
      const items = await readDemoPassports();
      const index = items.findIndex((item) => String(item.id) === id);
      if (index >= 0) {
        items[index] = { ...items[index], status: "DELETED" };
        await writeDemoPassports(items);
      }
      return;
    }
    return api<void>(`/api/passports/${id}`, { method: "DELETE" });
  },
};
export interface DiagnosisDetail {
  id: number;
  diagnosisType: "SELF" | "STORE";
  imageUrls: string[];
  itemScores: Record<string, number>;
  overallGrade: string;
  evidenceText: string;

  problemAreas?: { location: string; type: string; detail: string }[];
  diagnosedAt: string;
  previousItemScores: Record<string, number> | null;
}

export const diagnosisApi = {
  list: (productId: string, page = 0, size = 20, sort?: string) =>
    api<{ content: DiagnosisDetail[]; totalElements: number }>(
      `/api/passports/${productId}/diagnoses?page=${page}&size=${size}${sort ? `&sort=${encodeURIComponent(sort)}` : ""}`,
    ),
  detail: (diagnosisId: string) => api<DiagnosisDetail>(`/api/diagnoses/${diagnosisId}`),
  create: (
    productId: string,
    diagnosisType: "SELF" | "STORE",
    photos: { uri: string; name: string; type: string }[],
  ) => {
    const data = new FormData();
    data.append("diagnosisType", diagnosisType);
    photos.forEach((photo) => data.append("images", photo as any));
    return api<DiagnosisDetail>(`/api/passports/${productId}/diagnoses`, {
      method: "POST",
      body: data,
    });
  },
};
export interface TimelineItem {
  type:
    | "REGISTRATION"
    | "DIAGNOSIS"
    | "CARE"
    | "NOTIFICATION"
    | "USER_EVENT"
    | "RESERVATION"
    | "TRANSFER";
  id: number;
  occurredAt: string;
  detail: Record<string, unknown>;
}
export interface TimelineEventDetail {
  id: number;
  eventType: "MOMENT" | "STORE_VISIT" | "SELF_CARE" | "OTHER";
  note: string | null;
  imageUrl: string | null;
  eventDate: string;
}

export const journeyApi = {
  list: (productId: string) => api<TimelineItem[]>(`/api/passports/${productId}/timeline`),
  detail: (eventId: string) => api<TimelineEventDetail>(`/api/timeline/events/${eventId}`),
  create: (
    productId: string,
    request: {
      eventType: "MOMENT" | "STORE_VISIT" | "SELF_CARE" | "OTHER";
      note?: string;
      eventDate?: string;
    },
    image?: { uri: string; name: string; type: string },
  ) => {
    const data = new FormData();
    data.append("request", jsonPart(request));
    if (image) data.append("image", image as any);
    return api<TimelineEventDetail>(`/api/passports/${productId}/timeline/events`, {
      method: "POST",
      body: data,
    });
  },
  update: (id: string, body: { note: string }) =>
    api<TimelineEventDetail>(`/api/timeline/events/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  remove: (id: string) => api<void>(`/api/timeline/events/${id}`, { method: "DELETE" }),
};
export interface AccountInfo {
  id: number;
  email: string;
  nickname: string;
  createdAt: string;
}
export interface NotificationPreferences {
  careAlertsEnabled: boolean;
  journeyAlertsEnabled: boolean;
  marketingAlertsEnabled: boolean;
}

export const accountApi = {
  me: () => api<AccountInfo>("/api/account/me"),
  updateMe: (body: { nickname: string }) =>
    api<AccountInfo>("/api/account/me", { method: "PATCH", body: JSON.stringify(body) }),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    api<void>("/api/account/me/password", { method: "PATCH", body: JSON.stringify(body) }),
  notificationPreferences: () =>
    api<NotificationPreferences>("/api/account/me/notification-preferences"),
  updateNotificationPreferences: (body: NotificationPreferences) =>
    api<NotificationPreferences>("/api/account/me/notification-preferences", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  withdraw: () => api<void>("/api/account/me", { method: "DELETE" }),
};
export interface TransferPreview {
  modelName: string;
  ownershipDays: number;
  overallGrade: string;
}

export const transferApi = {
  issueCode: (passportId: string) =>
    api<{ code: string; expiresAt: string }>(`/api/passports/${passportId}/transfer-code`, {
      method: "POST",
    }),
  preview: (code: string) => api<TransferPreview>(`/api/passports/transfer/${code}/preview`),
  redeem: (code: string) =>
    api<PassportDetail>("/api/passports/transfer/redeem", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
};
export interface CareRecordDetail {
  id: number;
  careType: string;
  materialType: string | null;
  notes: string | null;
  imageUrl: string | null;
  completedAt: string;
}
export const careRecordApi = {
  list: (passportId: string, page = 0, size = 20, sort?: string) =>
    api<{ content: CareRecordDetail[]; totalElements: number }>(
      `/api/passports/${passportId}/care-records?page=${page}&size=${size}${sort ? `&sort=${encodeURIComponent(sort)}` : ""}`,
    ),
  detail: (id: string) => api<CareRecordDetail>(`/api/care-records/${id}`),
  create: (
    passportId: string,
    request: { careType: string; materialType?: string; notes?: string; completedAt?: string },
    image?: { uri: string; name: string; type: string },
  ) => {
    const data = new FormData();
    data.append("request", jsonPart(request));
    if (image) data.append("image", image as any);
    return api<CareRecordDetail>(`/api/passports/${passportId}/care-records`, {
      method: "POST",
      body: data,
    });
  },
};

export type NotificationType = "SELF_CARE" | "STORE_SERVICE" | "REPURCHASE" | "MILESTONE";
export interface CareNotification {
  id: number;
  type: NotificationType;
  reasonFactors: Record<string, unknown>;
  message: string;
  overallScore: number | null;
  read: boolean;
  dismissed: boolean;
  createdAt: string;
}
export const notificationApi = {
  list: (passportId: string, page = 0, size = 50) =>
    api<{ content: CareNotification[]; totalElements: number }>(
      `/api/passports/${passportId}/notifications?page=${page}&size=${size}`,
    ),
  markRead: (id: string) => api<void>(`/api/notifications/${id}/read`, { method: "PATCH" }),
  dismiss: (id: string) => api<void>(`/api/notifications/${id}/dismiss`, { method: "PATCH" }),
};
export const healthApi = { check: () => api<{ status: string }>("/api/health", { auth: false }) };

export interface StoreSummary {
  id: number;
  name: string;
  address: string;
  businessHoursStart: string;
  businessHoursEnd: string;
  slotLengthMinutes: number;
}

export const storeApi = {
  list: (page = 0, size = 20) =>
    api<{ content: StoreSummary[]; totalElements: number }>(
      `/api/stores?page=${page}&size=${size}`,
    ),
  detail: (id: string) => api<StoreSummary>(`/api/stores/${id}`),
};
export type CareRequestItemType =
  "LEATHER_CLEANING" | "METAL_POLISHING" | "STITCHING_REPAIR" | "OTHER";
export interface ReservationDetail {
  id: number;
  passportId: number;
  storeId: number;
  storeName: string;
  slotDateTime: string;
  requestItems: CareRequestItemType[];
  status: "REQUESTED" | "CANCELLED";
  createdAt: string;
}

export const reservationApi = {
  availableSlots: (storeId: string, date: string) =>
    api<string[]>(`/api/stores/${storeId}/available-slots?date=${date}`),
  create: (
    passportId: string,
    body: { storeId: number; slotDateTime: string; requestItems: CareRequestItemType[] },
  ) =>
    api<ReservationDetail>(`/api/passports/${passportId}/reservations`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  list: (passportId: string, page = 0, size = 20) =>
    api<{ content: ReservationDetail[]; totalElements: number }>(
      `/api/passports/${passportId}/reservations?page=${page}&size=${size}`,
    ),
  detail: (id: string) => api<ReservationDetail>(`/api/reservations/${id}`),
  cancel: (id: string) => api<void>(`/api/reservations/${id}/cancel`, { method: "PATCH" }),
};
