# MCM Nomad Passport — AI 파트(이현욱) 연동 명세서

담당: 정준영(백엔드) → 이현욱(AI/데이터)
대상 기능: 마모 진단 로직 (기획서 11절 "마모 진단 로직, Lifecycle Curator 판단 근거")
기준 커밋: `d6ab666`

## 0. 왜 이 문서가 필요한가

백엔드에는 마모 진단 로직을 담당하는 지점이 딱 하나로 분리돼 있어요:

```java
// src/main/java/com/mcm/passport/diagnosis/WearDiagnosisEngine.java
public interface WearDiagnosisEngine {
    DiagnosisResult diagnose(List<String> imageUrls, Diagnosis previousDiagnosis);
}
```

지금은 이 인터페이스의 자리에 **`RuleBasedWearDiagnosisEngine`**(고정 규칙 기반 임시 구현체)이 꽂혀 있고, Spring 설정에서 교체 가능하게 만들어져 있습니다:

```java
// WearDiagnosisEngineConfig.java
@Bean
@ConditionalOnProperty(name = "wear-diagnosis.engine", havingValue = "rule-based", matchIfMissing = true)
public WearDiagnosisEngine ruleBasedWearDiagnosisEngine() { return new RuleBasedWearDiagnosisEngine(); }
```

즉 **이현욱님의 실제 진단 로직이 이 지점을 대체**하는 구조입니다. 다만 어떤 방식으로 연동할지(백엔드가 AI 서버를 HTTP로 호출 vs. AI 로직을 Java로 직접 이식)는 아직 팀 내 미정이라, 이 문서는 **입출력 계약(무엇을 받고 무엇을 돌려줘야 하는지)은 확정하고, 연동 방식은 두 옵션을 모두 정리**했습니다. 이후 결정되는 대로 이 문서를 갱신할게요.

---

## 1. 백엔드 진단 흐름 (공통, 방식과 무관하게 동일)

`DiagnosisController.submit` → `DiagnosisService.submit` 순서로 실행됩니다:

1. 사용자가 `POST /api/passports/{passportId}/diagnoses`로 진단 이미지(여러 장)를 업로드
2. 백엔드가 이미지를 Cloudinary에 업로드하고 **URL 리스트**를 받음
3. 해당 여권의 **가장 최근 이전 진단 기록**을 DB에서 조회 (없으면 `null`)
4. **`wearDiagnosisEngine.diagnose(imageUrls, previousDiagnosis)` 호출** ← 이현욱님 로직이 대체할 지점
5. 반환된 `DiagnosisResult`를 `Diagnosis` 엔티티로 저장
6. 저장 실패 시 업로드했던 이미지 best-effort 삭제
7. 진단 결과 기반으로 알림 평가 로직 실행 (실패해도 진단 자체는 성공 처리)

**중요:** 이미지는 이미 Cloudinary에 업로드되어 URL 형태로 전달됩니다. AI 쪽에서 원본 바이너리를 직접 받을 필요는 없고, URL로 이미지를 가져와서 처리하는 구조가 기본 전제입니다.

---

## 2. 입출력 계약 (Data Contract)

### 입력

| 필드 | 타입 | 설명 |
|---|---|---|
| `imageUrls` | `List<String>` | 이번 진단에 첨부된 이미지들의 Cloudinary URL. 0~N장 (프론트에서 강제하는 최소 장수 없음 — 필요하면 논의). 각 이미지 최대 10MB. |
| `previousDiagnosis` | `Diagnosis` 또는 `null` | 같은 여권의 직전 진단 기록. 최초 진단이면 `null`. |

`previousDiagnosis`에서 실제로 쓸 수 있는 필드:

```java
Long id;
DiagnosisType diagnosisType;      // SELF | STORE
List<String> imageUrls;
Map<String, Integer> itemScores;  // 직전 진단의 항목별 점수
OverallGrade overallGrade;        // GOOD | NEEDS_CARE | URGENT
String evidenceText;
LocalDateTime diagnosedAt;
```

### 출력 — `DiagnosisResult`

```java
record DiagnosisResult(
    Map<String, Integer> itemScores,  // 항목명 -> 점수(0~100 권장)
    OverallGrade overallGrade,        // GOOD | NEEDS_CARE | URGENT
    String evidenceText               // 진단 근거 텍스트, DB 컬럼 최대 1000자
)
```

- `itemScores`: 키(항목명)와 개수는 **AI 파트가 정하는 대로 바꿀 수 있음** — 현재 임시 구현은 `"마모"`, `"코팅벗겨짐"`, `"변색"`, `"부자재상태"` 4개 고정 키를 씁니다. 프론트는 이 맵을 고정 스키마가 아니라 동적으로 렌더링하도록 안내해뒀으니, **항목을 늘리거나 이름을 바꿔도 프론트/백엔드 코드 변경은 최소화**됩니다. 다만 최종 확정되면 프론트/백엔드에 공유 필요.
- `overallGrade`: 반드시 `GOOD` / `NEEDS_CARE` / `URGENT` 셋 중 하나. 이 값이 여권 목록 화면(`PassportSummaryResponse.overallGrade`), 타임라인, 알림 트리거(`NotificationService.evaluateAfterDiagnosis`)에 직접 쓰입니다.
- `evidenceText`: **"Lifecycle Curator 판단 근거"**로 쓰이는 필드 — 사용자에게 노출되는 진단 설명 문구입니다. 1000자 제한.

### 현재 임시 구현 (참고용 — 알고리즘 자체는 대체 대상)

```java
// RuleBasedWearDiagnosisEngine.java — 마모 점수만 이미지 장수로 근사, 나머지는 파생값
int increment = images.size() >= 3 ? 5 : 10;
int wear = Math.min(100, previousWear + increment);
// coating = wear-5, discoloration = wear-10, hardware = wear-15 (모두 0 이상)
// grade: wear>=70 → URGENT, wear>=40 → NEEDS_CARE, else GOOD
```

---

## 3. 연동 방식 옵션 (미정 — 팀 논의 필요)

### 옵션 A. 백엔드 → AI 서버 HTTP 호출 (추천)

이현욱님이 Python(FastAPI/Flask 등)으로 별도 추론 서버를 만들고, 백엔드는 `WearDiagnosisEngine`의 새 구현체(`HttpWearDiagnosisEngine` 등)에서 이 서버를 HTTP로 호출.

**장점:** 언어/스택 완전 분리(Python 모델 그대로 사용), 배포/재시작 독립적, 장애 격리 쉬움(엔진 교체는 설정값 하나: `wear-diagnosis.engine=ai-model`).

제안 REST 계약 (AI 서버가 구현해야 할 엔드포인트 예시):

**`POST /diagnose`**

요청 예시:
```json
{
  "imageUrls": ["https://res.cloudinary.com/.../a.jpg", "https://res.cloudinary.com/.../b.jpg"],
  "previousDiagnosis": {
    "itemScores": { "마모": 20, "코팅벗겨짐": 15, "변색": 10, "부자재상태": 5 },
    "overallGrade": "GOOD",
    "diagnosedAt": "2026-08-01T00:00:00"
  }
}
```
`previousDiagnosis`는 최초 진단이면 `null`.

응답 예시 (`200 OK`):
```json
{
  "itemScores": { "마모": 25, "코팅벗겨짐": 20, "변색": 15, "부자재상태": 10 },
  "overallGrade": "GOOD",
  "evidenceText": "설명 텍스트"
}
```

논의 필요 항목:
- 엔드포인트 URL/포트, 인증 방식(내부망이면 인증 생략 가능, 아니면 API 키 헤더)
- 타임아웃 기준 (진단 제출은 사용자가 기다리는 동기 흐름이라 응답 시간이 UX에 직결 — 목표 응답 시간 합의 필요)
- 실패 시 처리: AI 서버 오류/타임아웃 시 백엔드가 어떻게 폴백할지 (예: 규칙 기반으로 폴백 vs. 진단 실패 처리)
- 이미지가 여러 장일 때 개별 이미지별 판단인지 종합 판단인지

### 옵션 B. Java 클래스로 직접 구현

이현욱님이 로직을 Java로 작성(또는 정준영이 파이썬 로직을 이식)해서 `WearDiagnosisEngine`을 직접 구현하는 새 클래스를 백엔드 코드베이스에 추가.

```java
public class AiWearDiagnosisEngine implements WearDiagnosisEngine {
    @Override
    public DiagnosisResult diagnose(List<String> imageUrls, Diagnosis previousDiagnosis) {
        // 로직 구현
    }
}
```
그리고 `WearDiagnosisEngineConfig`에 조건부 빈 추가:
```java
@Bean
@ConditionalOnProperty(name = "wear-diagnosis.engine", havingValue = "ai-model")
public WearDiagnosisEngine aiWearDiagnosisEngine() { return new AiWearDiagnosisEngine(); }
```

**장점:** 네트워크 홉 없음, 배포 단순(서버 하나). **단점:** 모델이 Python 기반이면 이식/래핑 비용 발생(JNI, ONNX Java 런타임, 프로세스 호출 등), 배포 시 Python 의존성을 Java 서버에 끌고 와야 할 수 있음.

### 결정에 필요한 정보
- 이현욱님 모델이 Python 기반인지, 추론 방식(로컬 모델 파일 vs. 외부 API 호출)이 무엇인지
- 해커톤 데모 시점까지 남은 시간 — 옵션 A가 병렬 개발엔 유리하지만 네트워크 연동 디버깅 시간이 필요

---

## 4. 설정 스위치 (참고)

`application.yml`:
```yaml
wear-diagnosis:
  engine: rule-based   # 현재 유일하게 존재하는 값. ai-model 등 새 값 추가 시 위 빈도 함께 추가돼야 함
```

---

## 5. 체크리스트 (다음 논의 때 확정할 것)
- [ ] 연동 방식: HTTP 서버 호출 vs. Java 직접 구현
- [ ] `itemScores` 항목 키 최종 확정 (이름/개수/점수 범위)
- [ ] `overallGrade` 판정 기준 (임계값 등) — 알림 트리거와 직결되므로 백엔드와 공유 필요
- [ ] `evidenceText` 포맷/톤 (프론트에 그대로 노출되는 사용자 대상 문구)
- [ ] (옵션 A 채택 시) AI 서버 엔드포인트 URL, 인증, 타임아웃, 실패 시 폴백 정책
- [ ] 이미지 장수 제약 (최소/최대), 여러 장일 때 종합 판단 방식
