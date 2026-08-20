import { Image } from "react-native";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { ApiError } from "../api/client";
import { getOcrApiBaseUrl } from "../config/serverAddress";

const MAX_DIMENSION = 1200;

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
}

async function shrinkForOcr(uri: string): Promise<string> {
  try {
    const { width, height } = await getImageSize(uri);
    if (Math.max(width, height) <= MAX_DIMENSION) return uri;

    const resize = width >= height ? { width: MAX_DIMENSION } : { height: MAX_DIMENSION };
    const result = await manipulateAsync(uri, [{ resize }], {
      compress: 0.85,
      format: SaveFormat.JPEG,
    });
    return result.uri;
  } catch {
    return uri;
  }
}

export interface OcrText {
  text: string;
  confidence: number;
  bbox: [number, number, number, number];
  matchedCode: string | null;
}

export interface OcrResult {
  texts: OcrText[];
  codeCandidates: OcrText[];
  bestCodeGuess: string | null;
}

export async function recognizeSerial(photo: {
  uri: string;
  name: string;
  type: string;
}): Promise<OcrResult> {
  const OCR_API_URL = await getOcrApiBaseUrl();
  if (!OCR_API_URL) {
    throw new ApiError(
      "OCR_API_BASE_URL_NOT_CONFIGURED",
      "OCR 서버 주소가 설정되지 않았습니다.",
      0,
    );
  }

  const resizedUri = await shrinkForOcr(photo.uri);
  const data = new FormData();
  data.append(
    "file",
    (resizedUri === photo.uri
      ? photo
      : { uri: resizedUri, name: photo.name, type: "image/jpeg" }) as unknown as Blob,
  );

  const controller = new AbortController();

  const timeout = setTimeout(() => controller.abort(), 60000);
  let response: Response;
  try {
    response = await fetch(`${OCR_API_URL}/ocr`, {
      method: "POST",
      body: data,
      signal: controller.signal,
    });
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      throw new ApiError("NETWORK_TIMEOUT", "OCR 서버 응답 시간이 초과되었습니다.", 0);
    }
    throw new ApiError("NETWORK_ERROR", "OCR 서버에 연결할 수 없습니다.", 0);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new ApiError(
      `HTTP_${response.status}`,
      text || "일련번호 인식에 실패했습니다.",
      response.status,
    );
  }

  const json = await response.json();
  const texts: OcrText[] = (json.texts ?? []).map((t: any) => ({
    text: t.text,
    confidence: t.confidence,
    bbox: t.bbox,
    matchedCode: t.matched_code ?? null,
  }));
  return {
    texts,
    codeCandidates: (json.code_candidates ?? []).map((t: any) => ({
      text: t.text,
      confidence: t.confidence,
      bbox: t.bbox,
      matchedCode: t.matched_code ?? null,
    })),
    bestCodeGuess: json.best_code_guess ?? null,
  };
}
