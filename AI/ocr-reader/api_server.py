"""
OCR(PaddleOCR) 텍스트 인식을 백엔드에서 바로 갖다 쓸 수 있게 감싼 FastAPI 서버.
데모 목표: 영문 1자 + 숫자 4자 코드(예: "A1234")를 앱 카메라로 스캔해서 인식.

실행:
    pip install -r requirements_api.txt
    python3 api_server.py
    # 또는: uvicorn api_server:app --host 0.0.0.0 --port 8002

문서(Swagger UI): 서버 실행 후 http://localhost:8002/docs

카메라 라이브 스캔 연동 방법 (이 저장소에는 앱 코드가 없어 서버만 준비함):
    앱이 프레임을 실시간 스트리밍할 필요는 없음 — ar-identification/defect-detection과
    동일하게 "카메라 프리뷰 중 일정 주기로 캡처한 사진 한 장을 /ocr에 POST" 방식이면 충분.
    예: 0.5~1초 간격으로 캡처 -> /ocr 호출 -> best_code_guess가 나오면 스캔 중단하고 결과 표시.
    프레임당 처리 시간은 OCR_DET_LIMIT_SIDE_LEN(기본 960, 작을수록 빠름/부정확)으로 조절.

엔드포인트:
    GET  /health   헬스체크
    POST /ocr      이미지 업로드 -> 인식된 텍스트 목록 + 코드 후보 JSON
"""
import asyncio
import os
import tempfile
from pathlib import Path

import cv2
from fastapi import FastAPI, File, HTTPException, Query, UploadFile

import ocr_engine

app = FastAPI(
    title="MCM OCR API",
    description="이미지 속 텍스트를 인식하고, 그중 시리얼/제품 코드로 보이는 후보를 추려 반환합니다.",
    version="1.0.0",
)

_engine = None


@app.on_event("startup")
def load_engine():
    global _engine
    _engine = ocr_engine.load_engine()
    print("OCR 엔진 로드 완료 (PaddleOCR)")


def _save_upload_to_tempfile(file: UploadFile) -> str:
    suffix = Path(file.filename or "image.jpg").suffix or ".jpg"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(file.file.read())
        return tmp.name


def _ensure_decodable(tmp_path: str) -> None:
    if cv2.imread(tmp_path) is None:
        raise HTTPException(status_code=400, detail="이미지를 읽을 수 없습니다. 다시 촬영해주세요.")


@app.get("/health")
def health():
    return {"status": "ok", "engine_loaded": _engine is not None}


@app.post("/ocr")
async def ocr(
    file: UploadFile = File(...),
    min_confidence: float = Query(default=0.0, ge=0.0, le=1.0),
):
    """이미지를 업로드하면 인식된 텍스트 영역 목록과 코드 후보(영문 1자+숫자 4자)를 JSON으로 반환.

    응답 예시:
        {
          "image": "photo.jpg",
          "texts": [
            {"text": "A1234", "confidence": 0.97, "bbox": [x1,y1,x2,y2], "matched_code": "A1234"},
            {"text": "MCM", "confidence": 0.95, "bbox": [...], "matched_code": null}
          ],
          "code_candidates": [...texts 중 matched_code가 있는 것만...],
          "best_code_guess": "A1234"
        }

    - `matched_code`: 원본 인식 텍스트를 목표 포맷(영문 1 + 숫자 4)에 맞춰 흔한 OCR 오인식
      (O/0, I/1, S/5, B/8 등)까지 보정한 값. 포맷에 안 맞으면 `null`.
    - `min_confidence`: 이 값 미만인 텍스트는 코드 후보(`code_candidates`/`best_code_guess`)에서
      제외(기본 0 = 필터 없음). 카메라로 연속 스캔하면서 오탐을 줄이고 싶을 때 0.8 등으로 올려서
      사용 — `texts`에는 필터 없이 전부 나오므로 디버깅용으로 계속 확인 가능.
    - **`best_code_guess` 하나만 믿지 말 것**: `code_candidates` 상위 몇 개를 함께 노출하거나,
      같은 코드가 연속 프레임에서 N번 이상 나올 때만 확정하는 클라이언트 쪽 안정화를 권장.
    - 텍스트가 전혀 없으면 `texts: []`, `best_code_guess: null`.
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="이미지 파일만 업로드 가능합니다.")

    tmp_path = _save_upload_to_tempfile(file)
    try:
        _ensure_decodable(tmp_path)
        # ocr_engine.run은 동기 블로킹 호출이라 await 없이 부르면 이 요청이 끝날 때까지
        # 이벤트 루프 전체가 멎어서 /health를 포함한 다른 요청도 같이 멈춘다.
        # 스레드로 분리해 이벤트 루프는 계속 돌게 한다.
        result = await asyncio.to_thread(ocr_engine.run, tmp_path, _engine)
    finally:
        os.unlink(tmp_path)

    if min_confidence > 0:
        result["code_candidates"] = [
            t for t in result["code_candidates"] if t["confidence"] >= min_confidence
        ]
        result["best_code_guess"] = (
            result["code_candidates"][0]["matched_code"] if result["code_candidates"] else None
        )

    result["image"] = file.filename
    return result


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8002)
