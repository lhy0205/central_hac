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

// server/ar-identification/api_server.py의 POST /identify를 호출한다. top-1 정확도가 61.9%라
// (HANDOFF.md 참고) 호출부는 top-1만 보지 말고 candidates와 similarity 임계값을 같이 봐야 한다.
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
  // 사진 업로드는 회선 상태에 따라 수 초에서 수십 초까지 걸린다. 서버 추론은 1초 미만이라
  // 대부분은 업로드 시간 — client.ts도 FormData 요청엔 같은 이유로 60초를 쓴다.
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
    } catch {
      /* not JSON */
    }
    throw new ApiError(
      `HTTP_${response.status}`,
      parsed.detail || "제품 인식에 실패했습니다.",
      response.status,
    );
  }

  return response.json() as Promise<IdentifyResponse>;
}
