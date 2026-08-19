# 하자 탐지 모델 (ML WearDiagnosisEngine)

`mcm_defect_detection_handoff.zip`으로 전달받은 1차 프로토타입 모델. 원본 전달 문서는 `HANDOFF.md` 참고.

## 이 폴더의 역할

`DiagnosisService`가 진단 생성 시 호출하는 `WearDiagnosisEngine`의 ML 구현체(`MlWearDiagnosisEngine`,
`src/main/java/com/mcm/passport/diagnosis/MlWearDiagnosisEngine.java`)가 여기 있는 `api_server.py`를
HTTP로 호출한다. 이 폴더 자체는 Spring Boot 빌드에 포함되지 않는 별도 Python 프로세스로 실행한다.

```
best.pt              학습된 가중치 (YOLO11l-seg, 7클래스, ~56MB)   ← 저장소에 없음
api_server.py         FastAPI 서버 (Spring이 호출하는 대상)
infer.py               추론 로직 (api_server.py가 내부적으로 사용)
vlm_report.py          /diagnose용 VLM 리포트 생성 (원본 전달분, 그대로 유지)
classes.yaml           클래스별 심각도 판정 기준
requirements_api.txt   필요 패키지
```

## 모델 가중치 받기 (필수)

`best.pt`는 **저장소에 없다**(`.gitignore` 처리). GitHub 무료 LFS는 저장·대역폭이 각 1GB뿐이라
clone할 때마다 한도가 깎이기 때문이다.

팀에 공유된 `mcm_defect_detection_handoff.zip`(구글 드라이브)의 `best.pt`를 이 디렉터리에
그대로 복사한다. 없으면 서버가 기동 중 모델 로드 단계에서 죽는다.

```bash
ls -lh best.pt   # 약 54MB
```

## 실행

```bash
cd ml/defect-detection
pip install -r requirements_api.txt
python3 api_server.py
# 기본 포트 8000, http://localhost:8000/docs 에서 Swagger UI 확인 가능
```

Spring 쪽에서 이 서버를 바라보게 하려면 `application.yml`의 `wear-diagnosis.engine`을 `ml`로 바꾸고
(또는 환경변수 `WEAR_DIAGNOSIS_ENGINE=ml`), 서버 주소가 다르면 `DEFECT_API_URL`을 설정한다.

```bash
export WEAR_DIAGNOSIS_ENGINE=ml
export DEFECT_API_URL=http://localhost:8000
```

기본값(`rule-based`)에서는 이 모델을 전혀 호출하지 않으므로, 배포 전까지는 안전하게 꺼둔 상태로 둘 수 있다.

## `/diagnose` — VLM 종합 리포트 (Spring 미연동, 선택)

2026-08-16 핸드오프에서 추가된 엔드포인트. YOLO 탐지 결과 + 원본 이미지를 VLM에 넣어 종합등급
(S/A/B/C/D), 항목별 점수, 판정 근거, 이전 진단 대비 추이를 생성한다.

**`MlWearDiagnosisEngine`은 이 엔드포인트를 쓰지 않는다** — 여전히 `/predict`만 호출한다.
`/diagnose`를 쓰려면 별도 연동이 필요하다.

`vlm_report.py`는 **로컬 Ollama**에 의존한다(pip 의존성은 늘지 않음 — stdlib `urllib`만 사용).

```bash
ollama serve
ollama pull qwen2.5vl:7b     # 기본 모델. VLM_MODEL 환경변수로 교체 가능
```

Ollama가 안 떠 있으면 `/diagnose`는 **503**과 함께 원인을 알려준다(그냥 두면 재시도로 30초를
태운 뒤 원인 불명 500이 나가서, 이 래퍼에서 잡아 변환한다). `/predict`는 VLM과 무관하게 동작한다.

> Docker Compose로 띄울 경우 컨테이너 안의 `localhost:11434`는 호스트의 Ollama에 닿지 않는다.
> 별도 설정 없이는 `/diagnose`만 503이 되고 나머지 기능은 정상이다.

## 알려진 한계 (HANDOFF.md에서 발췌, 중요)

- mask mAP50 약 0.262 — 아직 프로덕션 신뢰도는 아닌 1차 프로토타입/데모용.
  AI팀 기준 **이 수치가 최종**이다(2026-08-16, 데이터 추가 수집으로도 개선되지 않아 중단).
- `sole_separation`(밑창분리)은 학습 데이터가 없어 사실상 탐지 안 됨.
- `zipper_damage`(지퍼파손)는 금속 부속품 오탐 이력이 있어 신뢰도가 낮음 — 참고용.
- 학습 데이터가 전부 MCM 브랜드 중고거래 사진이라 다른 브랜드/신품 사진에는 잘 안 맞을 수 있음.
- `MlWearDiagnosisEngine`은 이 한계를 그대로 물려받는다 — 프로덕션 전환 전 재검증 필요.

## MlWearDiagnosisEngine의 점수 매핑

`RuleBasedWearDiagnosisEngine`과 동일한 0~100 점수/등급 체계를 유지하기 위해, 탐지된 각 하자의
`severity`를 다음과 같이 점수로 변환하고 하자 타입별로 최댓값을 취한다:

| severity | 점수 |
|---|---|
| minor | 30 |
| moderate | 55 |
| severe | 80 |

전체 등급은 모든 itemScore 중 최댓값을 `RuleBasedWearDiagnosisEngine.toGrade()`와 동일한
임계값(70/40)에 적용해 결정한다. 하자 타입 7종은 한글 라벨로 매핑됨 (`MlWearDiagnosisEngine.TYPE_LABELS`).
