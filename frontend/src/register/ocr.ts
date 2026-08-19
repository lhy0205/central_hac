import { Image } from "react-native";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { ApiError } from "../api/client";
import { getOcrApiBaseUrl } from "../config/serverAddress";

// 폰 카메라 원본(보통 3000~4000px 변)을 그대로 보내면 OCR 서버가 처리하는 데 90초를 넘겨
// 타임아웃이 난다(실측 확인됨). 긴 변을 줄여서 보내는데, 실측으로 보면 1600px과 1200px
// 사이 어딘가에 서버 쪽(아마 PaddleOCR 내부 리사이즈 한계) 임계값이 있다 — 1600px는
// 14초, 1200px는 0.5초, 정확도(신뢰도)는 둘 다 동일했다. 여유를 두고 1200px로 잡는다.
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
    // 긴 변 쪽만 지정해야 짧은 변이 그에 맞춰 비율대로 줄어든다 — 항상 width만 주면 세로
    // 사진(대부분의 카메라 촬영)에서는 세로가 여전히 원본 그대로 남는다.
    const resize = width >= height ? { width: MAX_DIMENSION } : { height: MAX_DIMENSION };
    const result = await manipulateAsync(uri, [{ resize }], {
      compress: 0.85,
      format: SaveFormat.JPEG,
    });
    return result.uri;
  } catch {
    // 축소 자체가 실패해도 원본으로 시도는 해본다 — 기존 동작보다 나빠지진 않는다.
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

// 백엔드/AR 인식 서버와 마찬가지로 별도 AI 서버를 앱이 직접 호출한다(등록 화면을 거치되,
// 백엔드는 거치지 않음 — 인식 결과는 최종적으로 사용자가 확인 화면에서 검수한 뒤에야
// productApi.create로 백엔드에 전달된다).
export async function recognizeSerial(photo: {
  uri: string;
  name: string;
  type: string;
}): Promise<OcrResult> {
  const OCR_API_URL = await getOcrApiBaseUrl();
  if (!OCR_API_URL) {
    throw new ApiError("OCR_API_BASE_URL_NOT_CONFIGURED", "OCR 서버 주소가 설정되지 않았습니다.", 0);
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
  // AR 인식과 같은 이유로 60초 — 사진 업로드가 추론 자체보다 오래 걸리는 경우가 많다.
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
    throw new ApiError(`HTTP_${response.status}`, text || "일련번호 인식에 실패했습니다.", response.status);
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
