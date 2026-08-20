import * as SecureStore from "expo-secure-store";

const API_OVERRIDE_KEY = "serverAddress.api";
const AR_OVERRIDE_KEY = "serverAddress.ar";
const OCR_OVERRIDE_KEY = "serverAddress.ocr";

export const DEFAULT_API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "";
export const DEFAULT_AR_API_BASE_URL = process.env.EXPO_PUBLIC_AR_API_BASE_URL || "";
export const DEFAULT_OCR_API_BASE_URL = process.env.EXPO_PUBLIC_OCR_API_BASE_URL || "";

let cachedApiBaseUrl: string | null = null;
let cachedArApiBaseUrl: string | null = null;
let cachedOcrApiBaseUrl: string | null = null;

async function resolve(key: string, fallback: string): Promise<string> {
  try {
    const override = await SecureStore.getItemAsync(key);
    return override && override.length > 0 ? override : fallback;
  } catch {
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
