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
  // 사진이 붙는 멀티파트 요청(등록·진단·케어기록·타임라인)은 Cloudinary 업로드까지 거쳐 8초를 쉽게 넘긴다.
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
// RN의 FormData는 문자열 파트에 Content-Type을 지정할 수 없어 항상 text/plain으로 나간다.
// Blob/data-URI로 감싸는 우회는 RN 0.81 네이티브 네트워킹에서 본문이 깨져 400이 났다.
// 대신 백엔드(WebMvcConfig)가 text/plain 파트도 JSON으로 파싱하도록 맞춰져 있다.
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
// 백엔드 PassportController 기준. serial+model+purchaseDate(YYYY-MM-DD)+usageFrequency(DAILY/FEW_TIMES_A_WEEK/OCCASIONAL/RARE)는 필수, 영수증/베이스라인 사진은 선택.
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
  /* VLM 리포트(/diagnose)가 내는 필드. 현재 백엔드의 진단 응답에는 없으므로 optional이다 —
     필수로 두면 타입은 통과하지만 런타임에 항상 undefined라 사용처에서 터진다. */
  problemAreas?: { location: string; type: string; detail: string }[];
  diagnosedAt: string;
  previousItemScores: Record<string, number> | null;
}
// 백엔드 DiagnosisController 기준. 파일 파트명은 images(복수), diagnosisType(SELF/STORE)은 필수 폼 필드.
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
// 백엔드 TimelineController 기준. 이벤트 생성은 request(JSON)+image(선택) 멀티파트. eventType은 MOMENT/STORE_VISIT/SELF_CARE/OTHER.
// 수정은 note만 바꿀 수 있음(eventType/eventDate/image는 백엔드 PATCH가 지원하지 않음).
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
// 백엔드 AccountController 기준. 이메일은 수정 불가(UpdateProfileRequest엔 nickname만 있음) — 회원정보 변경 화면에서 이메일 필드는 읽기 전용으로 표시해야 함.
// 알림 설정 중 careAlertsEnabled만 실제로 알림 생성을 막는다(NotificationService 게이팅) — journeyAlertsEnabled/marketingAlertsEnabled는
// 저장은 되지만 대응하는 알림 종류가 백엔드에 없어서 아직 아무 동작도 막지 않는다.
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
// 백엔드 TransferController 기준. issueCode는 원 소유자가 자기 여권에 대해 발급하는 것 — 현재 UI에 그 화면은 없어 여기 정의만 해둠.
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
// 백엔드 StoreController 기준.
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
// 백엔드 ReservationController 기준. slotDateTime은 반드시 미래 시각(로컬 타임존 없는 ISO-8601, 예: 2026-08-20T14:00:00).
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
