import * as SecureStore from "expo-secure-store";

/* 서버 주소는 EXPO_PUBLIC_* 환경변수로 지정하는데, 이 값은 Metro가 번들링할 때 문자열로
   치환해 APK 안에 박아버린다 — 즉 배포된 앱의 서버 주소는 재빌드 없이는 못 바꾼다.
   고정 서버로 배포하면 문제될 게 없지만, 데모 당일 주소가 틀어지면 앱을 다시 빌드해
   재설치하기 전까지 손쓸 방법이 없다.

   그래서 SecureStore에 저장된 재정의 값이 있으면 그걸 먼저 쓰고, 없으면 빌드에 박힌
   기본값으로 떨어진다. 새로 설치한 기기는 저장된 값이 없으므로 항상 기본값으로 동작한다
   — 사용자(심사위원)는 주소를 입력할 일이 없고, 재정의는 우리가 app/dev/server 화면에서
   직접 넣을 때만 생긴다. */

const API_OVERRIDE_KEY = "serverAddress.api";
const AR_OVERRIDE_KEY = "serverAddress.ar";
const OCR_OVERRIDE_KEY = "serverAddress.ocr";

export const DEFAULT_API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "";
export const DEFAULT_AR_API_BASE_URL = process.env.EXPO_PUBLIC_AR_API_BASE_URL || "";
export const DEFAULT_OCR_API_BASE_URL = process.env.EXPO_PUBLIC_OCR_API_BASE_URL || "";

// 매 요청마다 SecureStore를 읽으면 네이티브 왕복이 쌓인다. 재정의는 설정 화면에서만
// 바뀌므로 메모리에 캐시하고, 바뀔 때 무효화한다.
let cachedApiBaseUrl: string | null = null;
let cachedArApiBaseUrl: string | null = null;
let cachedOcrApiBaseUrl: string | null = null;

async function resolve(key: string, fallback: string): Promise<string> {
  try {
    const override = await SecureStore.getItemAsync(key);
    return override && override.length > 0 ? override : fallback;
  } catch {
    // SecureStore 접근이 실패해도 앱이 서버에 못 붙는 상태가 되면 안 된다.
    return fallback;
  }
}

export async function getApiBaseUrl(): Promise<string> {
  if (cachedApiBaseUrl === null) {
    cachedApiBaseUrl = await resolve(API_OVERRIDE_KEY, DEFAULT_API_BASE_URL);
  }
  return cachedApiBaseUrl;
}

export async function getArApiBaseUrl(): Promise<string> {
  if (cachedArApiBaseUrl === null) {
    cachedArApiBaseUrl = await resolve(AR_OVERRIDE_KEY, DEFAULT_AR_API_BASE_URL);
  }
  return cachedArApiBaseUrl;
}

export async function getOcrApiBaseUrl(): Promise<string> {
  if (cachedOcrApiBaseUrl === null) {
    cachedOcrApiBaseUrl = await resolve(OCR_OVERRIDE_KEY, DEFAULT_OCR_API_BASE_URL);
  }
  return cachedOcrApiBaseUrl;
}

/** 설정 화면이 현재 값을 보여주기 위해 쓴다. 재정의가 없으면 기본값이 그대로 나온다. */
export async function getCurrentAddresses() {
  return {
    api: await getApiBaseUrl(),
    ar: await getArApiBaseUrl(),
    ocr: await getOcrApiBaseUrl(),
    defaults: {
      api: DEFAULT_API_BASE_URL,
      ar: DEFAULT_AR_API_BASE_URL,
      ocr: DEFAULT_OCR_API_BASE_URL,
    },
  };
}

/** 빈 문자열을 넘기면 해당 항목의 재정의를 지우고 빌드 기본값으로 되돌린다. */
export async function setOverrides(api: string, ar: string, ocr: string) {
  const trimmedApi = api.trim();
  const trimmedAr = ar.trim();
  const trimmedOcr = ocr.trim();

  if (trimmedApi.length > 0) await SecureStore.setItemAsync(API_OVERRIDE_KEY, trimmedApi);
  else await SecureStore.deleteItemAsync(API_OVERRIDE_KEY);

  if (trimmedAr.length > 0) await SecureStore.setItemAsync(AR_OVERRIDE_KEY, trimmedAr);
  else await SecureStore.deleteItemAsync(AR_OVERRIDE_KEY);

  if (trimmedOcr.length > 0) await SecureStore.setItemAsync(OCR_OVERRIDE_KEY, trimmedOcr);
  else await SecureStore.deleteItemAsync(OCR_OVERRIDE_KEY);

  cachedApiBaseUrl = null;
  cachedArApiBaseUrl = null;
  cachedOcrApiBaseUrl = null;
}

export async function clearOverrides() {
  await setOverrides("", "", "");
}
