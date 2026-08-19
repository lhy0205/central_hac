# AI 종합 진단(VLM) S/A/B/C/D 등급 통합 — 설계

**날짜**: 2026-08-17
**범위**: `ml/defect-detection/api_server.py`의 `/diagnose`(VLM 종합 리포트, S/A/B/C/D 등급)를 `DiagnosisService`에 연동하고, `OverallGrade`를 기존 3단계(GOOD/NEEDS_CARE/URGENT)에서 5단계(S/A/B/C/D)로 완전히 교체한다. 프론트는 이미 5단계 전제로 짜여 있던 부분(진단 결과 차트)을 그대로 살리고, 3단계 전제로 짜여 있던 부분(목록 화면 라벨)만 정리한다.
**참고**: `MCM_Passport/ml/defect-detection/README.md`("`/diagnose` — VLM 종합 리포트(Spring 미연동, 선택)" 절), `MCM_Care_Mobile/src/theme.ts`(기존 임시 매핑), `MCM_Care_Mobile/app/diagnosis/result.tsx`(`GRADE_ORDER`)

## 1. 배경

하자 탐지 핸드오프(2026-08-16)에서 `/diagnose` 엔드포인트가 추가됐다 — YOLO 탐지 결과 + 원본 이미지를 로컬 Ollama(VLM)에 넣어 종합등급(S/A/B/C/D), 항목별 점수, 판정 근거, 이전 진단 대비 추이를 생성한다. 다만 README에 "Spring 미연동, 선택"으로 명시돼 있었고, `MlWearDiagnosisEngine`은 여전히 `/predict`만 호출해 3단계 등급만 계산한다. 프론트(`theme.ts`)는 이 3단계를 화면 표시용으로 S/A/C/D에 억지로 끼워 맞추는 임시 매핑을 이미 갖고 있었다("연동되면 번역 없이 그대로 보여주면 된다"는 주석 포함) — 즉 5단계로의 전환은 원래부터 예정된 다음 단계였다.

이번 작업은 그 다음 단계를 실행한다: `OverallGrade`를 5단계로 완전 교체하고, VLM을 세 번째 진단 엔진으로 추가한다.

## 2. 핵심 설계 결정

| 항목 | 결정 | 근거 |
|---|---|---|
| 등급 도메인 | `OverallGrade`를 `GOOD/NEEDS_CARE/URGENT` → `S/A/B/C/D`로 완전 교체 | DB 컬럼이 제약 없는 `VARCHAR(20)`이라 스키마 변경 없이 값만 바뀜. 프론트 진단 차트가 이미 이 5단계를 전제로 구현돼 있어 되돌아갈 이유가 없음 |
| 엔진 선택 | 기존 `wear-diagnosis.engine` 스위치에 `vlm` 값 추가 (`rule-based`/`ml`/`vlm`) | `WearDiagnosisEngineConfig`의 `@ConditionalOnProperty` 패턴을 그대로 재사용 — 새 빈 하나 추가로 끝나고, 값을 바꾸는 것만으로 즉시 켜고 끌 수 있음(무배포 롤백의 핵심) |
| 기본 엔진 | `matchIfMissing = true`를 `rule-based`에서 `vlm`으로 옮김 — 실제 AI로 진단하는 게 이제 표준 동작이고, `rule-based`/`ml`은 롤백 전용 예외 경로 | "AI 모델을 돌릴 거면 규칙 기반을 기본값으로 둘 이유가 없다"는 지적 반영. 트레이드오프: `WEAR_DIAGNOSIS_ENGINE`을 안 정하고 새로 clone하면 Ollama 없이는 진단 제출이 503 — 단, 앱 기동 자체는 영향 없음(`VlmWearDiagnosisEngine`은 `MlWearDiagnosisEngine`처럼 빈 생성 시점엔 Ollama에 접속하지 않고, 실제 진단 제출 요청에서만 호출함). README/`.env.example`에 이 값을 명시적으로 적어 두는 걸 구현 범위에 포함 |
| 규칙/ML 엔진의 임계값 | 기존 40/70 경계를 유지한 채 5구간으로 세분화: `<15 S, <30 A, <40 B, <70 C, ≥70 D` | `NotificationService`가 참조하는 경계값(40=케어 알림, 70=매장 알림)을 그대로 보존해 알림 동작이 안 바뀜. GOOD이었던 0~39 구간만 S/A/B로 더 세밀하게 나뉨 |
| 알림 트리거 | `NEEDS_CARE→SELF_CARE`, `URGENT→STORE_SERVICE` → `C→SELF_CARE`, `D→STORE_SERVICE` | 위 임계값 결정과 짝. S/A/B는 알림 없음(기존 GOOD과 동일) |
| VLM 엔진의 점수/근거 매핑 | `item_scores_label_ko`(이미 한글 라벨) → `itemScores`, `rationale`(+ `change_text` 있으면 이어붙임) → `evidenceText`(900자 절단, `MlWearDiagnosisEngine`과 동일 가드) | 기존 `DiagnosisResult(itemScores, overallGrade, evidenceText)` 구조를 그대로 재사용 — `problem_areas`/`trend`/`grade_change` 같은 VLM 전용 필드는 이번 스코프에 안 넣음(YAGNI, 필요해지면 별도 작업) |
| VLM 실패 처리 | Ollama 다운(503) → `MlWearDiagnosisEngine.predict()`와 동일하게 `ApiException`으로 변환, 업로드 이미지는 기존 고아 정리 로직으로 삭제 | 기존 실패 처리 패턴과 일관성 유지, 새 에러 클래스 불필요 |
| 기존 진단 기록 이관 | Flyway `V15`로 `GOOD→A, NEEDS_CARE→C, URGENT→D` 일괄 UPDATE | 프론트가 이미 쓰던 임시 매핑과 동일값이라, 사용자 입장에서 과거 기록의 표시 글자가 안 바뀜 |
| 라벨 표기 | 한글 등급 라벨(`gradeLabel`, "등급 양호") 폐기, 전 화면에서 글자 등급 그대로 노출("등급 A") | 지금도 목록 화면(`gradeLabel`)과 진단 상세 화면(`displayGrade`)이 서로 다른 표기를 쓰고 있었음 — 새로 한글 라벨을 만들면 그 불일치가 5단계로 그대로 이어짐. 문구를 새로 정할 필요도 없어짐 |
| 완전 원복 스크립트 | `scripts/rollback-overall-grade-v15.sql`을 Flyway 폴더 밖에 수동용으로 추가 | Flyway는 forward-only라 `db/migration`에 넣으면 자동 실행됨 — 정말 필요할 때만 사람이 판단해서 돌리는 별도 스크립트로 분리 |
| VLM에 보내는 `previous_diagnoses`의 `overall_score` | `previousDiagnosis.itemScores` 평균값을 직접 계산해서 채움 | `Diagnosis` 엔티티에 점수 평균을 저장하는 컬럼이 없음(`itemScores`만 있음) — VLM 자신이 `overall_score = sum(item_scores)/len(item_scores)`로 계산하는 방식과 동일하게 맞춤 |
| Ollama 접속 주소 | `vlm_report.py`의 `OLLAMA_URL`을 환경변수(`OLLAMA_HOST`, 기본값 `localhost:11434`)로 바꿈 | 지금은 `http://localhost:11434/api/generate`가 하드코딩돼 있어서, docker-compose로 백엔드/ML을 컨테이너로 띄우면 호스트 Ollama에 영원히 못 닿는다(`host.docker.internal` 지정 불가) — 이대로면 팀의 기본 개발 워크플로(compose)에서 `vlm` 엔진 자체가 못 씀 |
| VLM 호출 시 이미지 장수 | 여러 장 업로드해도 **첫 번째 이미지 1장만** `/diagnose`에 보냄 | `/diagnose`·`vlm_report.generate_report()` 둘 다 이미지 1장 기준으로만 설계돼 있음(리포트 하나에 등급·근거가 통째로 나옴). `MlWearDiagnosisEngine`처럼 이미지별로 호출해 점수만 max 병합하는 방식은 VLM에는 못 씀(리포트 여러 개를 병합할 방법이 참조 구현에 없음) — 스코프를 넘는 별도 작업으로 남김 |

## 3. 롤백 경로 (2단계)

1. **무배포(1순위)**: `WEAR_DIAGNOSIS_ENGINE`을 `rule-based` 또는 `ml`로 되돌린다. VLM 호출이 즉시 멈추고, 등급은 여전히 S/A/B/C/D 도메인이지만 임계값 계산으로 나온다. 코드 변경도, 마이그레이션도 필요 없음 — 데모 중 Ollama가 불안정할 때 쓸 1차 대응.
2. **완전 원복(2순위, 거의 안 쓸 것으로 예상)**: 등급 도메인 자체를 3단계로 되돌리는 경우. 다음 두 가지를 **함께** 해야 한다 — 하나만 하면 코드가 기대하는 enum과 DB 값이 어긋나 500이 난다.
   - 이번 스펙에 해당하는 커밋들을 `git revert`(enum, 임계값, `NotificationService`, 엔진 설정, 프론트 라벨 정리)
   - `scripts/rollback-overall-grade-v15.sql` 수동 실행: `A→GOOD, B→GOOD, S→GOOD, C→NEEDS_CARE, D→URGENT` (S/A/B를 전부 GOOD으로 합침 — 3단계 시절엔 그 구간이 전부 GOOD 하나였으므로 정보 손실은 원래도 있던 손실을 되돌리는 것뿐, 새로 생기는 손실 아님)

   스크립트 맨 위에 "코드도 같이 revert할 것" 경고 주석을 남긴다.

## 4. 구현 범위

**백엔드**
- `OverallGrade.java`: enum 값 교체
- `RuleBasedWearDiagnosisEngine.java`, `MlWearDiagnosisEngine.java`: `toGrade()` 5구간으로 재작성
- `NotificationService.java`: switch 케이스 `C`/`D`로 변경
- `VlmWearDiagnosisEngine.java` (신규): `/diagnose` 호출, 이전 진단 이력 조회해 `previous_diagnoses`로 전달, 응답 매핑
- `WearDiagnosisEngineConfig.java`: `vlm` 빈 추가, `matchIfMissing = true`를 `rule-based`에서 `vlm`으로 이동
- `.env.example`, `README.md`: `WEAR_DIAGNOSIS_ENGINE` 기본값이 `vlm`으로 바뀐 것과 Ollama 필요성을 명시
- `application.yml`: 필요 시 `wear-diagnosis.defect-api-url` 관련 문서 주석만 갱신(엔드포인트는 재사용이라 새 설정 키 불필요)
- `V15__migrate_overall_grade_to_letter_scale.sql` (신규)
- `scripts/rollback-overall-grade-v15.sql` (신규, Flyway 폴더 밖)
- `ml/defect-detection/vlm_report.py`: `OLLAMA_URL`을 `OLLAMA_HOST` 환경변수 기반으로 변경
- `ml/defect-detection/README.md`: "`/diagnose` — Spring 미연동, 선택" 절이 이번 작업으로 사실과 달라지므로 갱신
- 기존 테스트 중 옛 enum 상수(`GOOD`/`NEEDS_CARE`/`URGENT`)를 이름으로 참조하는 2개 파일은 **컴파일이 깨지므로 필수 수정** — 새로 만드는 게 아니라 고쳐 쓰는 것 (`NotificationServiceIntegrationTest.java`는 확인 결과 `OverallGrade`를 안 건드려서 무관):
  - `RuleBasedWearDiagnosisEngineTest.java`
  - `NotificationServiceTest.java`

**프론트**
- `src/theme.ts`: `BACKEND_TO_LETTER`/`displayGrade`의 특수 매핑 제거(항등 함수로 단순화 또는 `gradeLabel`과 통합), `GRADE_LABELS` 삭제
- `gradeLabel()`을 호출하는 10개 화면은 코드 변경 없음(함수 시그니처 유지, 내부 동작만 항등으로 단순화되므로 호출부는 안 건드림)
- `app/diagnosis/result.tsx`: 변경 없음(이미 5단계 전제로 구현돼 있음, `displayGrade` 참조만 정리된 버전을 그대로 씀)

**테스트**
- 새/변경 임계값 단위테스트(5구간 경계값)
- `NotificationService` 알림 트리거 테스트(C/D 케이스)
- `VlmWearDiagnosisEngine`은 Ollama 없이 실행해야 하므로 `/diagnose` 응답을 모킹한 단위테스트로 매핑 로직만 검증 — 실제 Ollama 연동 종단 검증은 이 스펙 범위 밖(환경에 Ollama 설치 후 별도 확인 필요)

## 5. 스코프 밖

- `problem_areas`(문제 부위 좌표), `grade_change`/`trend`(VLM이 자체 계산하는 추이) — 화면에 아직 노출 안 함. 필요해지면 `DiagnosisResult`/`DiagnosisResponse`/DB에 별도 컬럼 추가하는 후속 작업.
- Ollama 자체 설치/운영은 README에 이미 문서화된 별개 인프라 작업(단, 접속 주소를 하드코딩에서 env로 빼는 것만 이번 스코프에 포함 — 위 표 참고).
- **`itemScores` 항목 체계 불일치는 이번 작업 대상이 아님**: `RuleBasedWearDiagnosisEngine`은 4항목(마모/코팅벗겨짐/변색/부자재상태), `MlWearDiagnosisEngine`·`VlmWearDiagnosisEngine`은 7항목(찢어짐/스크래치/오염/마모/밑창분리/지퍼파손/변형)을 쓴다 — 이미 `ml` 엔진 도입 때부터 있던 불일치이고 VLM도 그대로 물려받는다. `vlm`이 기본 엔진이 되면서 평상시엔 이전 진단도 대부분 `vlm`이라 이 문제가 실제로 드러날 일은 거의 없음 — `rule-based`/`ml`로 롤백했다가 다시 `vlm`으로 돌아오는 그 경계에서만 잠깐 나타난다. 화면은 `Object.keys(itemScores)`로 동적으로 그리고 이전 진단에 없는 키는 `이전 -`로 우아하게 처리(`result.tsx:203`)하므로 깨지진 않음.
