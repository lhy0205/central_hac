"""
AR 상품 인식(탐지+식별) 파이프라인을 모바일 앱이 바로 호출할 수 있게 감싼 FastAPI 서버.
demo/pipeline.py의 BagPipeline을 그대로 재사용함. 자세한 내용/한계는 HANDOFF.md 참고.

실행:
    pip install -r requirements.txt -r requirements_api.txt
    python3 api_server.py
    # 또는: uvicorn api_server:app --host 0.0.0.0 --port 8001

문서(Swagger UI): 서버 실행 후 http://localhost:8001/docs

엔드포인트:
    GET  /health          헬스체크
    POST /identify         이미지 업로드 -> 탐지된 제품별 후보 SKU 목록(JSON)
"""
import os
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from PIL import UnidentifiedImageError

from demo.pipeline import BagPipeline

app = FastAPI(
    title="MCM AR 제품 인식 API",
    description="카메라로 찍은 사진에서 MCM 제품을 탐지하고, 730개 SKU 갤러리와 비교해 후보 제품을 반환합니다.",
    version="1.0.0",
)

_pipeline: BagPipeline | None = None


@app.on_event("startup")
def load_pipeline():
    global _pipeline
    _pipeline = BagPipeline()
    print(f"파이프라인 로드 완료 (device={_pipeline.device})")


@app.get("/health")
def health():
    return {
        "status": "ok",
        "pipeline_loaded": _pipeline is not None,
        "device": _pipeline.device if _pipeline else None,
    }


def _save_upload_to_tempfile(file: UploadFile) -> str:
    suffix = Path(file.filename or "image.jpg").suffix or ".jpg"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(file.file.read())
        return tmp.name


@app.post("/identify")
async def identify(file: UploadFile = File(...), topk: int = Query(default=3, ge=1, le=10)):
    """이미지를 업로드하면 탐지된 제품별로 후보 SKU(top-k, 유사도 내림차순)를 JSON으로 반환.

    응답 예시:
        {
          "image": "photo.jpg",
          "detections": [
            {
              "class": "Handbag",
              "confidence": 0.92,
              "bbox": [x1, y1, x2, y2],
              "candidates": [
                {"productId": "...", "name": "...", "similarity": 0.61},
                ...
              ]
            }
          ]
        }

    - `candidates`가 비어 있거나 `similarity`가 낮으면(권장 임계값 0.5) "인식 실패"로 처리할 것 —
      갤러리(730 SKU)에 없는 제품은 그럴듯하지만 틀린 답을 자신 있게 반환하는 closed-set 검색의
      근본적 한계가 있음 (HANDOFF.md 참고).
    - `detections`가 비어 있으면 이미지에서 제품 자체가 탐지되지 않은 것.
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="이미지 파일만 업로드 가능합니다.")

    tmp_path = _save_upload_to_tempfile(file)
    try:
        _, results = _pipeline.run(tmp_path, topk=topk)
    except UnidentifiedImageError:
        # content_type만 image/*이고 내용은 깨진 경우(업로드 중단 등). 서버 장애가 아니라 입력 문제다.
        raise HTTPException(status_code=400, detail="이미지를 읽을 수 없습니다. 다시 촬영해주세요.")
    finally:
        os.unlink(tmp_path)

    detections = [
        {
            "class": r["box"]["class"],
            "confidence": round(r["box"]["conf"], 3),
            "bbox": [round(v, 1) for v in r["box"]["xyxy"]],
            "candidates": r["candidates"],
        }
        for r in results
    ]

    return {"image": file.filename, "detections": detections}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8001)
