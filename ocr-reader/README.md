# OCR 서버 (코드 인식 데모)

`ar-identification`(정품 인증)을 보조하기 위한 별도 마이크로서비스. 가방 내부 태그 등에 각인/인쇄된
코드를 앱 카메라로 스캔한 사진에서 읽어 텍스트로 반환한다. `ar-identification`, `defect-detection`과
동일한 패턴(독립 FastAPI 프로세스, HTTP로 호출)으로 구성됨.

**데모 목표 포맷: 영문자 1개 + 숫자 4개** (예: `A1234`). `ocr_engine.py`가 이 포맷을 알고 있다는 걸
활용해 흔한 OCR 오인식(`O`/`0`, `I`/`1`, `S`/`5`, `B`/`8` 등)까지 자리별로 보정한다 — 포맷이
바뀌면 `OCR_CODE_LENGTH`/`OCR_CODE_PATTERN` 환경변수로 바꿀 수 있다(아래 참고).

## 이 폴더의 역할

```
ocr_engine.py          PaddleOCR 래퍼 — 텍스트 인식 + 코드 후보 추출 로직
api_server.py           FastAPI 서버
requirements_api.txt    필요 패키지
```

앱/백엔드에서 시리얼 코드를 확인하고 싶을 때 이 서버의 `/ocr`을 호출한다. `ar-identification`의
`/identify`(제품 종류·SKU 후보)와는 별개 축의 정보이며, 두 결과를 조합해 정품 인증 신뢰도를
높이는 용도로 쓰는 걸 권장한다(예: SKU 후보 + 코드가 해당 SKU의 실제 시리얼 패턴과 맞는지 대조).

## 모델 선택: PaddleOCR

2026년 기준 오픈소스 OCR/문서인식 벤치마크(OmniDocBench 등)에서 상위권이고, 특히 **각인·스탬프·
공산품 텍스트(embossed, dot-matrix)** 인식에 강점이 있다고 알려져 있어 — 가방 내부 가죽/금속
태그처럼 대비가 낮고 폰트가 특이한 텍스트에 적합할 것으로 판단해 채택함. `ocr_engine.py`는
버전을 못박지 않고 `PaddleOCR(lang="en", ...)`로 라이브러리가 자동 선택하는 최신 파이프라인을
쓴다 — 이 문서 작성 시점(`paddleocr==3.3.1`) 기준 자동 선택된 건 **PP-OCRv6**(det/rec 모두
medium)이다. 가중치는 최초 실행 시 자동 다운로드된다(수십MB).

> **GPU 사용을 강하게 권장 — CPU는 실사용 사진 한 장에 1분 이상 걸릴 수 있음(실측: CPU에서
> 3024x4032 사진 한 장에 168초).** `ar-identification`처럼 GPU가 있으면 자동으로 GPU를 쓰고
> (`ocr_engine._select_device`, `OCR_DEVICE` 환경변수로 강제 지정 가능), 없으면 CPU로
> 폴백한다 — 다만 CPU 폴백 시 위 지연을 감안해야 함. `requirements_api.txt`는 기본으로
> `paddlepaddle-gpu`를 설치하므로, GPU 없는 환경이면 상단 두 줄을 지우고 `paddlepaddle`
> (CPU판)로 바꿔서 설치할 것.
>
> 그와 별개로 `OCR_MAX_IMAGE_SIDE`(기본 1280)로 OCR 돌리기 전에 이미지를 먼저 줄인다 —
> 휴대폰 카메라 원본 해상도를 그대로 넣으면 GPU에서도 디코딩/후처리 비용이 불필요하게
> 커지기 때문. 두 조치(GPU + 리사이즈)를 합쳐 위 168초짜리 이미지가 0.5초대로 줄었음.

> **CPU 환경에서 `enable_mkldnn=False` 필수(코드에 이미 반영됨, CPU일 때만 적용)** —
> 기본값(mkldnn 활성화)으로 돌리면 이 환경(`paddlepaddle==3.3.1`)에서 `NotImplementedError:
> ConvertPirAttribute2RuntimeAttribute not support [...DoubleAttribute]`로 텍스트 탐지
> 단계에서 죽는 걸 확인함. 다른 CPU/버전 조합에서는 재현 안 될 수도 있지만, 굳이 켤 이유가
> 없어 기본으로 꺼둠.

> 방화벽 환경이면 사전에 `~/.paddlex`(`PADDLE_PDX_CACHE_HOME`) 캐시를 미리 받아둬야 한다 —
> `ar-identification`의 DINOv2 캐시 문제와 동일한 종류의 이슈.

> **`/ocr`은 스레드로 오프로드됨(`asyncio.to_thread`)** — 처음엔 동기 호출을 그대로 async
> 핸들러 안에서 불렀는데, 큰 이미지 하나가 오래 걸리는 동안(위 168초 사례) 이벤트 루프 전체가
> 멈춰서 `/health`를 포함한 다른 모든 요청까지 같이 응답 불능이 되는 걸 실제로 재현함 — 이제는
> 느린 요청 하나가 다른 요청을 막지 않음.

대안으로 검토했던 것: **PaddleOCR-VL**(같은 팀의 VLM, 구조화 문서 파싱에 특화, 88.41
OmniDocBench)은 페이지 단위 레이아웃/마크다운 파싱에 최적화돼 있어 "사진 한 장 속 짧은 코드
텍스트 하나 읽기"엔 과함 — 필요해지면(예: 복잡한 태그 레이아웃 파싱) 교체 검토 가능.

## 실행

```bash
cd ocr-reader
pip install -r requirements_api.txt
python3 api_server.py
# 기본 포트 8002, http://localhost:8002/docs 에서 Swagger UI 확인 가능
```

환경변수(전부 선택):

| 변수 | 기본값 | 의미 |
|---|---|---|
| `OCR_CODE_LENGTH` | `5` | 목표 코드 총 길이 |
| `OCR_CODE_PATTERN` | `^[A-Z][0-9]{4}$` | 목표 코드 정규식(길이와 같이 바꿀 것) |
| `OCR_DEVICE` | (자동 감지) | `gpu` 또는 `cpu`로 강제 지정. 기본은 GPU 있으면 GPU, 없으면 CPU |
| `OCR_MAX_IMAGE_SIDE` | `1280` | OCR 돌리기 전 이미지 긴 변을 이 값 이하로 축소(비율 유지). 휴대폰 원본 해상도(3000px+)를 그대로 넣었을 때의 지연을 막는 주 요인 |
| `OCR_DET_LIMIT_SIDE_LEN` | `960` | 텍스트 탐지 모델 내부 리사이즈 상한(위 리사이즈 이후 추가 적용). 작을수록 빠르지만 작은 글자를 놓치기 쉬움 |

## 카메라로 라이브 스캔하기

이 저장소에는 모바일 앱 코드가 없어(별도 저장소) 서버만 준비함. `ar-identification`이
`/identify`를 쓰는 것과 같은 방식으로 붙이면 됨 — **영상 스트리밍이 아니라 스냅샷 폴링**:

1. 카메라 프리뷰를 켠 채로 0.5~1초 간격으로 프레임을 캡처해 `/ocr`에 POST.
2. `best_code_guess`가 나오면(원하면 `min_confidence`로 필터링) 스캔을 멈추고 결과 표시.
3. 오탐이 신경 쓰이면 같은 코드가 연속 N프레임 나올 때만 확정하는 안정화 로직을 클라이언트에 추가.

프레임당 처리 시간이 사용자 체감에 중요하면 `OCR_DET_LIMIT_SIDE_LEN`을 낮춰서(예: 640) 속도를
올릴 수 있음(정확도와 트레이드오프).

## API

### POST /ocr (multipart/form-data, 필드명 `file`, 쿼리 `min_confidence` 선택)

```json
{
  "image": "photo.jpg",
  "texts": [
    { "text": "A1234", "confidence": 0.97, "bbox": [120.0, 80.0, 210.0, 110.0], "matched_code": "A1234" },
    { "text": "MCM", "confidence": 0.95, "bbox": [50.0, 20.0, 140.0, 60.0], "matched_code": null }
  ],
  "code_candidates": [
    { "text": "A1234", "confidence": 0.97, "bbox": [120.0, 80.0, 210.0, 110.0], "matched_code": "A1234" }
  ],
  "best_code_guess": "A1234"
}
```

- `texts`: 이미지에서 인식된 모든 텍스트, 신뢰도 내림차순(필터 없이 전부 포함, 디버깅용).
- `matched_code`: 원본 인식 텍스트(`text`)를 목표 포맷(영문 1 + 숫자 4)에 맞춰 **자리별로 흔한
  OCR 오인식을 보정**(`O`/`0`, `I`/`1`, `S`/`5`, `B`/`8` 등)한 값. 길이가 다르거나 보정해도 포맷이
  안 맞으면 `null`(`ocr_engine._match_code`).
- `min_confidence`(쿼리, 기본 0): 이 값 미만인 텍스트는 `code_candidates`/`best_code_guess`에서
  제외. `texts`는 필터 없이 그대로 반환됨.
- `best_code_guess`가 `null`이면 코드로 보이는 텍스트를 못 찾은 것 — 사진을 다시 찍도록 안내하거나
  `texts`를 사용자에게 보여주고 직접 고르게 하는 폴백을 권장.
- **`best_code_guess` 하나만 믿지 말 것** — 보정을 거쳐도 오인식 가능성은 남는다.
  `code_candidates` 상위 몇 개를 함께 보여주거나, 위에서 말한 연속 프레임 안정화를 권장.

## 알려진 한계

- **포맷이 데모용 가정("영문 1 + 숫자 4")** — 실제 MCM 코드 규칙(자릿수, 허용 문자, 접두사 등)이
  확정되면 `OCR_CODE_LENGTH`/`OCR_CODE_PATTERN`과 `ocr_engine._TO_LETTER`/`_TO_DIGIT` 보정
  매핑을 실제 포맷에 맞게 다시 검토해야 함.
- PaddleOCR은 범용 OCR 모델이며 MCM 태그 폰트/각인에 파인튜닝되지 않았다 — 조명이 어둡거나
  각도가 심하게 기울어진 사진에서는 인식률이 떨어질 수 있음.
- 정확도가 실측 검증된 적 없음(1차 구축, 합성 텍스트 이미지로만 스모크 테스트함) — 실제 태그
  사진 샘플로 code_candidates 적중률을 확인 필요.
- `ar-identification`/`defect-detection`과 마찬가지로 최초 실행 시 인터넷에서 모델 가중치를
  받아온다.
