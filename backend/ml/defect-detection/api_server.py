"""
하자 탐지 모델을 백엔드에서 바로 갖다 쓸 수 있게 감싼 FastAPI 서버.
scripts/infer.py의 로직(run, draw_annotated)을 그대로 재사용함.

실행:
    export MODEL_WEIGHTS=/path/to/best.pt   # 기본값: ../models/handoff/best.pt
    python3 api_server.py
    # 또는: uvicorn api_server:app --host 0.0.0.0 --port 8000

문서(Swagger UI): 서버 실행 후 http://localhost:8000/docs

엔드포인트:
    GET  /health              헬스체크
    GET  /classes              지원 클래스 목록
    POST /predict               이미지 업로드 -> 하자 탐지 결과 JSON
    POST /predict/annotated     이미지 업로드 -> 박스/마스크 그려진 결과 이미지(JPEG)
    POST /diagnose               이미지(+이전 진단 이력) 업로드 -> 종합 진단 리포트(등급/점수/추이) JSON
"""
import json
import os
import tempfile
from pathlib import Path

import cv2
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from ultralytics import YOLO

import infer  # scripts/infer.py (run, draw_annotated, load_rules)
import vlm_report  # scripts/vlm_report.py (generate_report)

SCRIPT_DIR = Path(__file__).parent
# 가중치는 이 디렉터리에 함께 둔다(핸드오프 원본은 AI팀 로컬 레이아웃인 ../models/handoff를 가리킨다).
DEFAULT_WEIGHTS = SCRIPT_DIR / "best.pt"
WEIGHTS_PATH = os.environ.get("MODEL_WEIGHTS", str(DEFAULT_WEIGHTS))

app = FastAPI(
    title="가방/구두 하자 탐지 API",
    description="이미지 속 가방·구두·액세서리의 하자(스크래치/오염/마모/변형 등) 위치와 심각도를 판정합니다.",
    version="1.0.0",
)

_model: YOLO | None = None


@app.on_event("startup")
def load_model():
    global _model
    if not Path(WEIGHTS_PATH).exists():
        raise RuntimeError(f"모델 가중치를 찾을 수 없습니다: {WEIGHTS_PATH}")
    _model = YOLO(WEIGHTS_PATH)
    print(f"모델 로드 완료: {WEIGHTS_PATH}")
    print(f"클래스: {_model.names}")


def _save_upload_to_tempfile(file: UploadFile) -> str:
    suffix = Path(file.filename or "image.jpg").suffix or ".jpg"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(file.file.read())
        return tmp.name


def _ensure_decodable(tmp_path: str) -> None:
    """content_type만 image/*이고 내용은 깨진 경우(업로드 중단 등)를 걸러낸다.

    그냥 두면 ultralytics가 빈 결과를 돌려주고 infer.run이 results[0]에서 IndexError를 내
    500이 된다 — 서버 장애가 아니라 입력 문제이므로 400으로 알린다.
    """
    if cv2.imread(tmp_path) is None:
        raise HTTPException(status_code=400, detail="이미지를 읽을 수 없습니다. 다시 촬영해주세요.")


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": _model is not None, "weights": WEIGHTS_PATH}


@app.get("/classes")
def classes():
    return {"classes": _model.names}


@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    """이미지를 업로드하면 하자 목록(종류/위치/심각도/수리 권장사항)을 JSON으로 반환."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="이미지 파일만 업로드 가능합니다.")

    tmp_path = _save_upload_to_tempfile(file)
    try:
        _ensure_decodable(tmp_path)
        result, _ = infer.run(tmp_path, model=_model)
    finally:
        os.unlink(tmp_path)

    result["image"] = file.filename  # 임시 파일 경로 대신 원래 파일명으로
    return result


@app.post("/predict/annotated")
async def predict_annotated(file: UploadFile = File(...)):
    """이미지를 업로드하면 하자 위치가 박스/마스크로 표시된 결과 이미지(JPEG)를 반환."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="이미지 파일만 업로드 가능합니다.")

    tmp_path = _save_upload_to_tempfile(file)
    out_path = tmp_path + "_result.jpg"
    try:
        _ensure_decodable(tmp_path)
        result, results = infer.run(tmp_path, model=_model)
        infer.draw_annotated(tmp_path, result, results, out_path)
        img_bytes = Path(out_path).read_bytes()
    finally:
        os.unlink(tmp_path)
        if os.path.exists(out_path):
            os.unlink(out_path)

    return Response(content=img_bytes, media_type="image/jpeg")


@app.post("/diagnose")
async def diagnose(file: UploadFile = File(...), previous_diagnoses: str = Form(default="[]")):
    """이미지를 업로드하면 종합 진단 리포트를 반환.

    종합등급(S/A/B/C/D), 항목별 점수, 문제 부위, 판정 근거를 YOLO 탐지 결과 + VLM이
    이미지를 직접 보고 판단해 생성함. previous_diagnoses로 이 제품의 과거 진단
    기록(JSON 배열 문자열, 오래된 순)을 함께 보내면 등급 변화와 추이도 함께 반환.
    각 기록은 최소 {"date", "overall_grade", "overall_score"} 포함, "problem_areas" 있으면 더 정확.
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="이미지 파일만 업로드 가능합니다.")

    try:
        previous = json.loads(previous_diagnoses) if previous_diagnoses else []
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="previous_diagnoses는 올바른 JSON 배열 문자열이어야 합니다.")

    tmp_path = _save_upload_to_tempfile(file)
    try:
        _ensure_decodable(tmp_path)
        result, _ = infer.run(tmp_path, model=_model)
        try:
            report = vlm_report.generate_report(tmp_path, result["defects"], previous)
        except OSError as e:
            # vlm_report는 별도 프로세스인 Ollama(VLM_MODEL)에 의존한다. 그게 안 떠 있으면
            # 서버 장애가 아니라 의존 서비스 부재이므로 503으로 알린다 — 그냥 두면 원인을
            # 알 수 없는 500이 나가고, query_ollama가 재시도로 30초를 먼저 태운다.
            raise HTTPException(
                status_code=503,
                detail=f"VLM 서버에 연결할 수 없습니다({vlm_report.OLLAMA_URL}, 모델 {vlm_report.MODEL}). "
                       "Ollama가 실행 중인지 확인해주세요.",
            ) from e
    finally:
        os.unlink(tmp_path)

    report["image"] = file.filename
    return report


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
