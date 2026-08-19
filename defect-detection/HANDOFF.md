# 가방/구두/액세서리 하자 탐지 모델 — 백엔드 핸드오프 (1차)

## 구성
- `best.pt` — 학습된 모델 가중치 (YOLO11l-seg 기반, 7클래스)
- `api_server.py` — FastAPI 서버 (바로 실행 가능)
- `infer.py` — 추론 로직 (api_server.py가 내부적으로 사용, CLI로 단독 실행도 가능)
- `vlm_report.py` — YOLO 결과+이미지를 VLM에 넣어 종합 진단 리포트 생성 (`/diagnose`가 사용)
- `classes.yaml` — 클래스별 심각도 판정 기준
- `requirements_api.txt` — 필요 패키지

## 실행
```bash
pip install -r requirements_api.txt
python3 api_server.py
```
기본 포트 8000. `http://localhost:8000/docs` 에서 Swagger UI로 바로 테스트 가능.

다른 경로의 가중치를 쓰려면:
```bash
MODEL_WEIGHTS=/path/to/other.pt python3 api_server.py
```

**`/diagnose` 엔드포인트를 쓰려면 Ollama가 추가로 필요합니다** (하자 탐지는 YOLO, 등급·점수·근거는 VLM이 이미지를 직접 보고 판단):
```bash
ollama pull qwen2.5vl:7b
ollama serve   # 기본 포트 11434
```
`/predict`, `/predict/annotated`는 Ollama 없이도 정상 동작합니다. `VLM_MODEL` 환경변수로 다른 vision 지원 Ollama 모델로 교체 가능(기본값 `qwen2.5vl:7b`).

## API

### GET /health
헬스체크. `{"status": "ok", "model_loaded": true, "weights": "..."}`

### GET /classes
지원 클래스 목록.

### POST /predict
이미지를 업로드하면 하자 목록을 JSON으로 반환.

요청: `multipart/form-data`, 필드명 `file`
```bash
curl -X POST http://localhost:8000/predict -F "file=@사진.jpg"
```

응답 예시:
```json
{
  "image": "사진.jpg",
  "defects": [
    {
      "type": "scratch",
      "confidence": 0.53,
      "bbox": [637.0, 1488.0, 864.8, 1681.0],
      "area_ratio": 0.0121,
      "severity": "minor",
      "severity_label": "경미",
      "repair_recommendation": "자가 관리 또는 간단 클리닝으로 충분"
    }
  ],
  "summary": "1개 하자 탐지됨, 최고 심각도: 경미"
}
```
- `type`: tear/scratch/stain/wear/sole_separation/zipper_damage/deformation 중 하나
- `severity`: minor/moderate/severe
- `bbox`: 원본 이미지 픽셀 좌표 [x1, y1, x2, y2]
- 하자가 없으면 `defects: []`

### POST /predict/annotated
이미지를 업로드하면 박스/마스크가 그려진 결과 이미지(JPEG)를 반환. 요청 형식은 `/predict`와 동일.

### POST /diagnose
이미지를 업로드하면 **종합 진단 리포트**를 JSON으로 반환. YOLO 탐지 결과를 근거로 주되,
등급·점수·문제부위·판정근거는 VLM이 이미지를 직접 보고 판단함.

요청: `multipart/form-data`
- `file`: 이미지 (필수)
- `previous_diagnoses`: 이 제품의 과거 진단 기록 JSON 배열 문자열, 오래된 순 (선택, 기본값 `[]`)
  - **진단 이력은 이 서버가 저장하지 않습니다 — 백엔드가 관리하고, 매 요청마다 함께 보내야
    등급 변화(`grade_change`)와 추이(`trend`)가 계산됩니다.**
  - 각 기록 최소 형식: `{"date": "2026-05-01", "overall_grade": "A", "overall_score": 88}`
    (`problem_areas` 배열도 같이 보내면 VLM이 위치까지 비교해서 더 정확한 변화 설명을 씀)

```bash
curl -X POST http://localhost:8000/diagnose \
  -F "file=@사진.jpg" \
  -F 'previous_diagnoses=[{"date":"2026-05-01","overall_grade":"A","overall_score":88}]'
```

응답 예시:
```json
{
  "overall_grade": "B",
  "overall_score": 82.9,
  "item_scores": {"tear": 95, "scratch": 80, "stain": 70, "wear": 60, "sole_separation": 100, "zipper_damage": 90, "deformation": 85},
  "item_scores_label_ko": {"찢어짐": 95, "스크래치": 80, "얼룩/변색": 70, "마모": 60, "밑창분리": 100, "지퍼/버클": 90, "형태변형": 85},
  "problem_areas": [
    {"location": "오른쪽 하단 모서리", "type": "스크래치", "detail": "오른쪽 하단 모서리에 경미한 스크래치가 있습니다."}
  ],
  "rationale": "판정 근거 설명 (한글 2~4문장)",
  "grade_change": {
    "previous_grade": "A", "previous_score": 88,
    "current_grade": "B", "current_score": 82.9,
    "score_delta": -5.1,
    "description": "이전 대비 무엇이 달라졌는지 설명"
  },
  "trend": [
    {"date": "2026-05-01", "overall_grade": "A", "overall_score": 88},
    {"date": "current", "overall_grade": "B", "overall_score": 82.9}
  ],
  "defects": [ /* /predict와 동일한 YOLO 원본 탐지 결과 */ ],
  "model": "qwen2.5vl:7b",
  "image": "사진.jpg"
}
```
- `overall_score`는 `item_scores` 7개 항목의 평균 (0~100)
- `previous_diagnoses`를 안 보내면 `grade_change`는 `null`, `trend`는 현재 항목 1개만
- VLM 응답이므로 `/predict`보다 느림 (로컬 7B 기준 이미지당 약 20~30초)

## 클래스별 성능 (val 기준, mask mAP50)
| 클래스 | mAP50 | 비고 |
|---|---|---|
| tear | 0.641 | 가장 안정적 |
| deformation | 0.165 | val 샘플 6개뿐이라 수치 신뢰도 낮음 |
| stain | 0.209 | |
| wear | 0.194 | |
| scratch | 0.100 | 미세한 하자라 가장 어려움 |
| sole_separation | — | 학습 데이터 0건, 탐지 안 됨 |
| zipper_damage | — | 학습 데이터 0건(자동 라벨링 오탐이 반복 확인돼서 제거함), 탐지 안 됨 |
| **전체 평균** | **0.262** | |

## 알려진 한계 (중요, 꼭 확인해주세요)
- **정확도**: mask mAP50 0.262 수준. 아직 프로덕션 신뢰도는 아니고, 1차 프로토타입/데모용으로 판단해주세요.
- **sole_separation(밑창분리)**: 학습 데이터가 없어 사실상 탐지가 안 됩니다.
- **zipper_damage(지퍼파손)**: 자동 라벨링 과정에서 금속 부속품(체인/스터드/훅)을 지퍼로 오인하는 오탐이 반복 확인돼서 학습 데이터에서 제거했습니다. 클래스 정의 자체는 모델에 남아있지만 학습 데이터가 없어 사실상 탐지되지 않습니다.
- **scratch(스크래치)**: 미세한 하자라 재현율이 특히 낮습니다(대부분의 실제 스크래치를 놓칠 수 있음).
- **데이터 편향**: 학습 데이터가 전부 MCM 브랜드 중고거래 사진(번개장터)입니다. 다른 브랜드나 신품/스튜디오 촬영 사진에는 잘 안 맞을 수 있습니다.
- **(2026-08-16)** 데이터 추가 수집(2,300여 장)까지 시도했으나 VLM 자동 라벨링 자체의 정밀도 한계가 병목으로 확인되어, 위 수치가 현재 기준 최종 버전입니다. 추가 성능 개선은 자동화보다 사람 라벨 검수가 필요합니다.
- **`/diagnose`의 등급·점수는 VLM(Qwen2.5-VL)이 이미지를 보고 자체 판단한 결과**이며, 위 표의 mAP50과는 다른 신뢰도 축입니다. YOLO가 놓친 하자를 VLM이 잡아낼 수도, 반대로 VLM이 과장/과소 평가할 수도 있습니다 — 사람 검수 없이 프로덕션 등급 산정에 그대로 쓰기보다는 참고용/1차 초안으로 사용 권장.

## 문의
모델/데이터 관련 문의는 원 개발자에게 연락 바랍니다.
