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
