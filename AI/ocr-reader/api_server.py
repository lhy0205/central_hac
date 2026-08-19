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
