"""
PaddleOCR 기반 텍스트 인식 엔진. 이미지에서 텍스트 영역을 찾아 텍스트/신뢰도/좌표를
뽑고, 그중 코드로 보이는 후보를 규칙 기반으로 추려낸다.

PaddleOCR을 고른 이유(README.md 참고): 2026년 기준 오픈소스 OCR 벤치마크(OmniDocBench 등)
상위권이면서, 특히 각인/스탬프/공산품 텍스트(dot-matrix, embossed) 인식에 강해 가방 내부
시리얼 태그처럼 대비가 낮고 폰트가 특이한 텍스트에 적합함.

최초 실행 시 PaddleOCR이 모델 가중치를 자동 다운로드한다(수십MB). 방화벽 환경이면
`~/.paddlex`(PADDLE_PDX_CACHE_HOME) 캐시를 미리 받아둬야 한다.
"""
import os
import re
from typing import Optional

import cv2
import numpy as np
import paddle
from paddleocr import PaddleOCR

# 데모 목표 포맷: 영문자 1개 + 숫자 4개 (예: "A1234"). 다른 포맷으로 바뀌면 이 두 값만
# 고치면 됨(둘 다 배포 시 환경변수로도 덮어쓸 수 있음).
CODE_LENGTH = int(os.environ.get("OCR_CODE_LENGTH", "5"))
_CODE_PATTERN = os.environ.get("OCR_CODE_PATTERN", r"^[A-Z][0-9]{4}$")
_CODE_RE = re.compile(_CODE_PATTERN)

# 카메라로 실시간 스캔할 때는 매 프레임을 고해상도 그대로 돌리면 느리다. 휴대폰 카메라
# 원본 해상도(3000~4000px)를 CPU/GPU 어느 쪽이든 그대로 돌리면 처리 시간이 크게 늘어나서
# (실측: CPU에서 3024x4032 한 장에 168초 — 앱 타임아웃의 원인이었음) 여기서 먼저 한 변을
# 이 값 이하로 줄인 뒤 PaddleOCR에 넘긴다. text_det_limit_side_len은 탐지 모델 내부
# 리사이즈만 담당하고 디코딩/후처리 비용은 못 줄이므로 별도로 앞단에서 리사이즈함.
MAX_IMAGE_SIDE = int(os.environ.get("OCR_MAX_IMAGE_SIDE", "1280"))
DET_LIMIT_SIDE_LEN = int(os.environ.get("OCR_DET_LIMIT_SIDE_LEN", "960"))

# 포맷을 알고 있다는 걸 활용해 흔한 OCR 오인식을 자리별로 보정한다.
# 첫 자리(영문 기대)에 숫자가 나오면 -> 문자로, 나머지 자리(숫자 기대)에 문자가 나오면 -> 숫자로.
_TO_LETTER = {"0": "O", "1": "I", "5": "S", "8": "B", "2": "Z", "6": "G", "7": "T"}
_TO_DIGIT = {"O": "0", "Q": "0", "D": "0", "I": "1", "L": "1", "S": "5", "B": "8", "Z": "2", "G": "6", "T": "7"}

_engine: Optional[PaddleOCR] = None


def _select_device() -> str:
    override = os.environ.get("OCR_DEVICE")
    if override:
        return override
    if paddle.device.is_compiled_with_cuda() and paddle.device.cuda.device_count() > 0:
        return "gpu"
    return "cpu"


def load_engine(lang: str = "en") -> PaddleOCR:
    global _engine
    if _engine is None:
        device = _select_device()
        _engine = PaddleOCR(
            lang=lang,
            device=device,
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=True,
            text_det_limit_side_len=DET_LIMIT_SIDE_LEN,
            # mkldnn은 CPU 전용 최적화 경로다. GPU에서는 의미 없고, CPU에서는 이 환경
            # (paddlepaddle 3.3.1 + paddlex 조합)의 기본값(True)이 텍스트 탐지 단계에서
            # NotImplementedError로 죽는 걸 확인해서 CPU일 때만 명시적으로 꺼준다.
            **({"enable_mkldnn": False} if device == "cpu" else {}),
        )
        print(f"OCR 엔진 device={device}")
    return _engine


def _match_code(text: str) -> Optional[str]:
    """인식된 텍스트가 (보정하면) 목표 코드 포맷과 맞는지 확인하고, 맞으면 보정된 코드를 반환.

    포맷 길이(CODE_LENGTH)와 다르면 애초에 후보가 아니므로 None. 길이가 맞으면 자리별로
    기대 문자 종류(영문/숫자)와 다른 글자를 흔한 오인식 매핑으로 바꿔본 뒤 최종적으로
    패턴에 맞는지 다시 확인한다 — 보정해도 안 맞으면 코드가 아니라고 판단.
    """
    normalized = re.sub(r"[^A-Z0-9]", "", text.upper())
    if len(normalized) != CODE_LENGTH:
        return None

    chars = list(normalized)
    if chars[0].isdigit():
        chars[0] = _TO_LETTER.get(chars[0], chars[0])
    for i in range(1, CODE_LENGTH):
        if chars[i].isalpha():
            chars[i] = _TO_DIGIT.get(chars[i], chars[i])

    corrected = "".join(chars)
    return corrected if _CODE_RE.match(corrected) else None


def _poly_to_bbox(poly) -> list[float]:
    poly_arr = np.asarray(poly, dtype=float)
    x1, y1 = poly_arr.min(axis=0).tolist()
    x2, y2 = poly_arr.max(axis=0).tolist()
    return [round(x1, 1), round(y1, 1), round(x2, 1), round(y2, 1)]


def _load_and_resize(image_path: str) -> np.ndarray:
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"이미지를 읽을 수 없습니다: {image_path}")
    h, w = img.shape[:2]
    longest = max(h, w)
    if longest > MAX_IMAGE_SIDE:
        scale = MAX_IMAGE_SIDE / longest
        img = cv2.resize(img, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA)
    return img


def run(image_path: str, engine: Optional[PaddleOCR] = None) -> dict:
    """이미지 하나를 OCR로 읽어 텍스트 영역 목록과 코드 후보를 반환.

    반환:
        {
          "texts": [{"text", "confidence", "bbox", "matched_code"}, ...]  # 신뢰도 내림차순
          "code_candidates": [...texts 중 matched_code가 있는 것들...]
          "best_code_guess": 가장 신뢰도 높은 code_candidate의 matched_code(보정된 코드), 없으면 None
        }

    `matched_code`는 원본 인식 텍스트(`text`)를 목표 포맷(영문 1 + 숫자 4)에 맞춰 흔한 오인식
    (O/0, I/1, S/5, B/8 등)까지 보정한 값 — `best_code_guess`는 이 값을 쓴다.
    """
    if engine is None:
        engine = load_engine()

    img = _load_and_resize(image_path)
    pages = engine.predict(img)

    texts = []
    for page in pages:
        rec_texts = page["rec_texts"]
        rec_scores = page["rec_scores"]
        rec_polys = page["rec_polys"]
        for text, score, poly in zip(rec_texts, rec_scores, rec_polys):
            if not text.strip():
                continue
            texts.append({
                "text": text,
                "confidence": round(float(score), 3),
                "bbox": _poly_to_bbox(poly),
                "matched_code": _match_code(text),
            })

    texts.sort(key=lambda t: t["confidence"], reverse=True)
    code_candidates = [t for t in texts if t["matched_code"]]

    return {
        "texts": texts,
        "code_candidates": code_candidates,
        "best_code_guess": code_candidates[0]["matched_code"] if code_candidates else None,
    }
