import { ApiError } from "../api/client";
import { getArApiBaseUrl } from "../config/serverAddress";

export interface IdentifyCandidate {
  productId: string;
  name: string | null;
  similarity: number;
}

export interface IdentifyDetection {
  class: string;
  confidence: number;
  bbox: [number, number, number, number];
  candidates: IdentifyCandidate[];
}

export interface IdentifyResponse {
  image: string;
  detections: IdentifyDetection[];
}

export const IDENTIFY_CONFIDENCE_THRESHOLD = 0.5;

export async function identifyProduct(
  photo: { uri: string; name: string; type: string },
  topk = 3,
): Promise<IdentifyResponse> {
  const AR_API_URL = await getArApiBaseUrl();
  if (!AR_API_URL) {
    throw new ApiError(
      "AR_API_BASE_URL_NOT_CONFIGURED",
      "AR 인식 서버 주소가 설정되지 않았습니다.",
      0,
    );
  }

  const data = new FormData();
  data.append("file", photo as unknown as Blob);

  const controller = new AbortController();

  const timeout = setTimeout(() => controller.abort(), 60000);
  let response: Response;
  try {
    response = await fetch(`${AR_API_URL}/identify?topk=${topk}`, {
      method: "POST",
      body: data,
      signal: controller.signal,
    });
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      throw new ApiError("NETWORK_TIMEOUT", "인식 서버 응답 시간이 초과되었습니다.", 0);
    }
    throw new ApiError("NETWORK_ERROR", "인식 서버에 연결할 수 없습니다.", 0);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const text = await response.text();
    let parsed: { detail?: string } = {};
    try {
      parsed = JSON.parse(text);
    } catch {}
    throw new ApiError(
      `HTTP_${response.status}`,
      parsed.detail || "제품 인식에 실패했습니다.",
      response.status,
    );
  }

  return response.json() as Promise<IdentifyResponse>;
}
