# AI 종합 진단(VLM) S/A/B/C/D 등급 통합 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `OverallGrade`를 3단계(GOOD/NEEDS_CARE/URGENT)에서 5단계(S/A/B/C/D)로 완전 교체하고, VLM(`/diagnose`) 기반 종합 진단 엔진을 새 기본 엔진으로 연동한다.

**Architecture:** 기존 `WearDiagnosisEngine` 인터페이스와 `wear-diagnosis.engine` 스위치 패턴을 그대로 재사용해 `VlmWearDiagnosisEngine`을 세 번째 구현체로 추가하고, 기본값(`matchIfMissing`)을 `rule-based`에서 `vlm`으로 옮긴다. `OverallGrade`는 DB에서 제약 없는 `VARCHAR(20)`이라 스키마 변경 없이 값만 교체(Flyway UPDATE)하면 되고, 기존 3단계 값을 참조하는 `RuleBasedWearDiagnosisEngine`/`MlWearDiagnosisEngine`/`NotificationService`/테스트 2개를 5단계에 맞게 같이 고친다.

**Tech Stack:** Spring Boot 3.3.4, Java, JUnit5 + AssertJ + Mockito + `MockRestServiceServer`(spring-test), Flyway, FastAPI/Python(ml 서버), Expo/React Native/TypeScript(프론트)

**Spec:** `docs/superpowers/specs/2026-08-17-vlm-grade-integration-design.md`

## Global Constraints

- `OverallGrade` 값은 정확히 `S, A, B, C, D` (이 순서로 선언).
- 점수→등급 임계값: `<15 S, <30 A, <40 B, <70 C, ≥70 D` (기존 40/70 경계 보존).
- 알림 매핑: `C → SELF_CARE`, `D → STORE_SERVICE`, `S/A/B → 알림 없음`.
- `wear-diagnosis.engine` 기본값(`matchIfMissing`)은 `vlm`. `rule-based`/`ml`은 명시적 설정 시에만 활성화.
- VLM 호출은 이미지 여러 장이 와도 **첫 번째 1장만** 사용.
- 기존 진단 이력 마이그레이션: `GOOD→A, NEEDS_CARE→C, URGENT→D`.
- 프론트 등급 표기는 한글 라벨 없이 글자 그대로("등급 A").

---

## Task 1: `OverallGrade` 5단계 교체 + 엔진 임계값 + 알림 매핑

이 넷은 한 커밋으로 묶는다 — enum을 바꾸는 순간 나머지가 컴파일이 깨지므로 부분 상태로 커밋할 수 없다.

**Files:**
- Modify: `src/main/java/com/mcm/passport/diagnosis/OverallGrade.java`
- Modify: `src/main/java/com/mcm/passport/diagnosis/RuleBasedWearDiagnosisEngine.java`
- Modify: `src/main/java/com/mcm/passport/diagnosis/MlWearDiagnosisEngine.java`
- Modify: `src/main/java/com/mcm/passport/notification/NotificationService.java`
- Modify: `src/test/java/com/mcm/passport/diagnosis/RuleBasedWearDiagnosisEngineTest.java`
- Modify: `src/test/java/com/mcm/passport/notification/NotificationServiceTest.java`

**Interfaces:**
- Produces: `OverallGrade` enum with constants `S, A, B, C, D` — every later task (Task 3의 `VlmWearDiagnosisEngine`) uses `OverallGrade.valueOf(String)` against these exact names.

- [ ] **Step 1: 기존 테스트를 새 등급 기대값으로 먼저 고친다 (컴파일이 깨지는 게 정상)**

`src/test/java/com/mcm/passport/diagnosis/RuleBasedWearDiagnosisEngineTest.java` 전체를 아래로 교체:

```java
package com.mcm.passport.diagnosis;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class RuleBasedWearDiagnosisEngineTest {

    private final RuleBasedWearDiagnosisEngine engine = new RuleBasedWearDiagnosisEngine();

    @Test
    void firstDiagnosisWithThreeImagesStartsFromBaseline() {
        DiagnosisResult result = engine.diagnose(
            List.of("https://cdn/1.jpg", "https://cdn/2.jpg", "https://cdn/3.jpg"), null);

        assertThat(result.itemScores().get("마모")).isEqualTo(25); // 기본 20 + 3장 이상이라 +5
        assertThat(result.itemScores().get("코팅벗겨짐")).isEqualTo(20); // 25 - 5
        assertThat(result.itemScores().get("변색")).isEqualTo(15); // 25 - 10
        assertThat(result.itemScores().get("부자재상태")).isEqualTo(10); // 25 - 15
        assertThat(result.overallGrade()).isEqualTo(OverallGrade.A); // 25점: <30 구간
    }

    @Test
    void wearScoreIncreasesFromPreviousDiagnosis() {
        Diagnosis previous = new Diagnosis(1L, DiagnosisType.SELF,
            List.of("https://cdn/old.jpg"), Map.of("마모", 60), OverallGrade.C, "이전");

        DiagnosisResult result = engine.diagnose(List.of("https://cdn/1.jpg"), previous);

        assertThat(result.itemScores().get("마모")).isEqualTo(70); // 이전 60 + 사진 1장이라 +10
        assertThat(result.overallGrade()).isEqualTo(OverallGrade.D); // 70점: >=70 구간
    }

    @Test
    void wearScoreCapsAt100() {
        Diagnosis previous = new Diagnosis(1L, DiagnosisType.SELF,
            List.of("https://cdn/old.jpg"), Map.of("마모", 95), OverallGrade.D, "이전");

        DiagnosisResult result = engine.diagnose(List.of("https://cdn/1.jpg"), previous);

        assertThat(result.itemScores().get("마모")).isEqualTo(100);
    }

    @Test
    void nullImageUrlsHandledGracefully() {
        DiagnosisResult result = engine.diagnose(null, null);

        assertThat(result.itemScores().get("마모")).isEqualTo(30); // 기본 20 + null이므로 +10
        assertThat(result.overallGrade()).isEqualTo(OverallGrade.B); // 30점: <40 구간(경계값)
    }

    @Test
    void fiveGradeThresholdBoundaries() {
        // 경계값 5개를 명시적으로 검증 — <15 S, <30 A, <40 B, <70 C, >=70 D
        assertThat(scoreToGrade(0)).isEqualTo(OverallGrade.S);
        assertThat(scoreToGrade(14)).isEqualTo(OverallGrade.S);
        assertThat(scoreToGrade(15)).isEqualTo(OverallGrade.A);
        assertThat(scoreToGrade(29)).isEqualTo(OverallGrade.A);
        assertThat(scoreToGrade(30)).isEqualTo(OverallGrade.B);
        assertThat(scoreToGrade(39)).isEqualTo(OverallGrade.B);
        assertThat(scoreToGrade(40)).isEqualTo(OverallGrade.C);
        assertThat(scoreToGrade(69)).isEqualTo(OverallGrade.C);
        assertThat(scoreToGrade(70)).isEqualTo(OverallGrade.D);
        assertThat(scoreToGrade(100)).isEqualTo(OverallGrade.D);
    }

    private OverallGrade scoreToGrade(int wearScore) {
        // BASELINE_WEAR=20, 이미지 1장 기준 +10 증가라 previous로 원하는 점수를 직접 세팅해서 검증한다.
        Diagnosis previous = new Diagnosis(1L, DiagnosisType.SELF,
            List.of("https://cdn/old.jpg"), Map.of("마모", wearScore - 10), OverallGrade.S, "이전");
        return engine.diagnose(List.of("https://cdn/1.jpg"), previous).overallGrade();
    }
}
```

`src/test/java/com/mcm/passport/notification/NotificationServiceTest.java`의 세 테스트 메서드(50~87행)를 아래로 교체(파일의 다른 부분은 그대로 둔다):

```java
    @Test
    void goodGradeCreatesNoNotification() {
        notificationService = new NotificationService(
            notificationRepository, passportRepository, diagnosisRepository, passportOwnershipGuard, accountRepository, fixedClock, 90, 30);
        Passport passport = passportWithPurchaseDate(LocalDate.of(2024, 1, 1));
        Diagnosis diagnosis = new Diagnosis(1L, DiagnosisType.SELF, List.of("https://cdn/1.jpg"),
            Map.of("마모", 20), OverallGrade.A, "근거");

        notificationService.evaluateAfterDiagnosis(passport, diagnosis);

        verify(notificationRepository, never()).save(any());
    }

    @Test
    void needsCareGradeCreatesSelfCareNotification() {
        notificationService = new NotificationService(
            notificationRepository, passportRepository, diagnosisRepository, passportOwnershipGuard, accountRepository, fixedClock, 90, 30);
        Passport passport = passportWithPurchaseDate(LocalDate.of(2024, 1, 1));
        Diagnosis diagnosis = new Diagnosis(1L, DiagnosisType.SELF, List.of("https://cdn/1.jpg"),
            Map.of("마모", 50), OverallGrade.C, "근거");

        notificationService.evaluateAfterDiagnosis(passport, diagnosis);

        verify(notificationRepository).save(argThat(n -> n.getType() == NotificationType.SELF_CARE));
    }

    @Test
    void urgentGradeCreatesStoreServiceNotification() {
        notificationService = new NotificationService(
            notificationRepository, passportRepository, diagnosisRepository, passportOwnershipGuard, accountRepository, fixedClock, 90, 30);
        Passport passport = passportWithPurchaseDate(LocalDate.of(2024, 1, 1));
        Diagnosis diagnosis = new Diagnosis(1L, DiagnosisType.SELF, List.of("https://cdn/1.jpg"),
            Map.of("마모", 80), OverallGrade.D, "근거");

        notificationService.evaluateAfterDiagnosis(passport, diagnosis);

        verify(notificationRepository).save(argThat(n -> n.getType() == NotificationType.STORE_SERVICE));
    }
```

- [ ] **Step 2: 컴파일 확인 (실패해야 정상)**

Run: `./gradlew compileTestJava`
Expected: FAIL — `cannot find symbol: variable A/C/D` in `OverallGrade` (아직 3단계 enum이라서).

- [ ] **Step 3: `OverallGrade` enum 교체**

`src/main/java/com/mcm/passport/diagnosis/OverallGrade.java` 전체를 아래로 교체:

```java
package com.mcm.passport.diagnosis;

public enum OverallGrade {
    S, A, B, C, D
}
```

- [ ] **Step 4: `RuleBasedWearDiagnosisEngine`의 `toGrade()`를 5구간으로**

`src/main/java/com/mcm/passport/diagnosis/RuleBasedWearDiagnosisEngine.java`에서 아래 메서드를:

```java
    private OverallGrade toGrade(int wearScore) {
        if (wearScore >= 70) return OverallGrade.URGENT;
        if (wearScore >= 40) return OverallGrade.NEEDS_CARE;
        return OverallGrade.GOOD;
    }
```

이렇게 교체:

```java
    private OverallGrade toGrade(int wearScore) {
        if (wearScore >= 70) return OverallGrade.D;
        if (wearScore >= 40) return OverallGrade.C;
        if (wearScore >= 30) return OverallGrade.B;
        if (wearScore >= 15) return OverallGrade.A;
        return OverallGrade.S;
    }
```

- [ ] **Step 5: `MlWearDiagnosisEngine`의 `toGrade()`도 동일하게**

`src/main/java/com/mcm/passport/diagnosis/MlWearDiagnosisEngine.java`에서 아래 메서드를:

```java
    private OverallGrade toGrade(int score) {
        if (score >= 70) return OverallGrade.URGENT;
        if (score >= 40) return OverallGrade.NEEDS_CARE;
        return OverallGrade.GOOD;
    }
```

이렇게 교체:

```java
    private OverallGrade toGrade(int score) {
        if (score >= 70) return OverallGrade.D;
        if (score >= 40) return OverallGrade.C;
        if (score >= 30) return OverallGrade.B;
        if (score >= 15) return OverallGrade.A;
        return OverallGrade.S;
    }
```

- [ ] **Step 6: `NotificationService`의 switch를 새 등급으로**

`src/main/java/com/mcm/passport/notification/NotificationService.java`에서 아래 블록을:

```java
        switch (diagnosis.getOverallGrade()) {
            case NEEDS_CARE -> create(passport.getId(), NotificationType.SELF_CARE, reasonFactors,
                "마모가 진행되고 있어요. 셀프케어 가이드를 확인해보세요.", overallScore);
            case URGENT -> create(passport.getId(), NotificationType.STORE_SERVICE, reasonFactors,
                "상태가 심각해요. 공식 서비스 예약을 고려해보세요.", overallScore);
            case GOOD -> {
            }
        }
```

이렇게 교체:

```java
        switch (diagnosis.getOverallGrade()) {
            case C -> create(passport.getId(), NotificationType.SELF_CARE, reasonFactors,
                "마모가 진행되고 있어요. 셀프케어 가이드를 확인해보세요.", overallScore);
            case D -> create(passport.getId(), NotificationType.STORE_SERVICE, reasonFactors,
                "상태가 심각해요. 공식 서비스 예약을 고려해보세요.", overallScore);
            case S, A, B -> {
            }
        }
```

- [ ] **Step 7: 전체 테스트 실행 — 통과해야 정상**

Run: `./gradlew test --tests "com.mcm.passport.diagnosis.*" --tests "com.mcm.passport.notification.*"`
Expected: PASS (`RuleBasedWearDiagnosisEngineTest`의 5개 테스트, `NotificationServiceTest`의 전체 테스트 포함)

- [ ] **Step 8: 커밋**

```bash
git add src/main/java/com/mcm/passport/diagnosis/OverallGrade.java \
        src/main/java/com/mcm/passport/diagnosis/RuleBasedWearDiagnosisEngine.java \
        src/main/java/com/mcm/passport/diagnosis/MlWearDiagnosisEngine.java \
        src/main/java/com/mcm/passport/notification/NotificationService.java \
        src/test/java/com/mcm/passport/diagnosis/RuleBasedWearDiagnosisEngineTest.java \
        src/test/java/com/mcm/passport/notification/NotificationServiceTest.java
git commit -m "feat: OverallGrade를 S/A/B/C/D 5단계로 교체"
```

---

## Task 2: 기존 진단 이력 마이그레이션 + 완전 원복 스크립트

**Files:**
- Create: `src/main/resources/db/migration/V15__migrate_overall_grade_to_letter_scale.sql`
- Create: `scripts/rollback-overall-grade-v15.sql`

**Interfaces:**
- Consumes: Task 1에서 확정된 `S/A/B/C/D` 값.
- Produces: 없음(데이터 마이그레이션 전용, 다른 태스크가 이 파일을 참조하지 않음).

- [ ] **Step 1: Flyway 마이그레이션 작성**

`src/main/resources/db/migration/V15__migrate_overall_grade_to_letter_scale.sql`:

```sql
-- OverallGrade를 GOOD/NEEDS_CARE/URGENT(3단계) → S/A/B/C/D(5단계)로 교체하면서
-- 기존 진단 기록의 표시 등급을 프론트가 쓰던 임시 매핑과 동일하게 맞춘다.
UPDATE diagnosis SET overall_grade = 'A' WHERE overall_grade = 'GOOD';
UPDATE diagnosis SET overall_grade = 'C' WHERE overall_grade = 'NEEDS_CARE';
UPDATE diagnosis SET overall_grade = 'D' WHERE overall_grade = 'URGENT';
```

- [ ] **Step 2: 완전 원복용 스크립트 작성 (Flyway 폴더 밖, 수동 실행 전용)**

`scripts/rollback-overall-grade-v15.sql`:

```sql
-- ⚠️ 이 스크립트 단독 실행 금지.
--
-- V15 마이그레이션(S/A/B/C/D로 교체)을 완전히 되돌리는 수동 스크립트다.
-- db/migration 폴더 밖에 있어서 Flyway가 자동 실행하지 않는다 — 정말 필요할 때
-- 사람이 판단해서 psql로 직접 돌린다.
--
-- 반드시 docs/superpowers/specs/2026-08-17-vlm-grade-integration-design.md에 해당하는
-- 애플리케이션 코드 커밋(OverallGrade enum, RuleBasedWearDiagnosisEngine/MlWearDiagnosisEngine
-- 임계값, NotificationService, WearDiagnosisEngineConfig, 프론트 theme.ts)을 먼저
-- git revert한 뒤에 실행할 것. 코드만 되돌리고 이 스크립트를 안 돌리면 DB에 남은
-- S/A/B/C/D 값을 옛 enum이 모르는 값으로 봐서 500이 나고, 반대로 이 스크립트만 돌리고
-- 코드를 안 되돌리면 새 코드가 GOOD/NEEDS_CARE/URGENT를 모르는 값으로 봐서 역시 500이 난다.
--
-- 실행: psql -U <user> -d mcm_passport -f scripts/rollback-overall-grade-v15.sql
--
-- S/A/B는 3단계 시절엔 전부 GOOD 하나였으므로 그 구간으로 합친다(원래도 있던
-- 손실을 되돌리는 것뿐, 새로 생기는 손실 아님).
UPDATE diagnosis SET overall_grade = 'GOOD' WHERE overall_grade IN ('S', 'A', 'B');
UPDATE diagnosis SET overall_grade = 'NEEDS_CARE' WHERE overall_grade = 'C';
UPDATE diagnosis SET overall_grade = 'URGENT' WHERE overall_grade = 'D';
```

- [ ] **Step 3: 마이그레이션이 깨끗하게 적용되는지 확인**

Docker db 컨테이너가 떠 있는 상태에서:

Run: `./gradlew flywayInfo` (또는 `./gradlew bootRun`으로 기동 후 로그에서 `Successfully applied 1 migration to schema "public", now at version v15` 확인)
Expected: `V15__migrate_overall_grade_to_letter_scale` 행이 `Success` 상태로 표시됨. 앱이 정상 기동됨(마이그레이션 실패 시 Flyway가 기동을 막음).

- [ ] **Step 4: 커밋**

```bash
git add src/main/resources/db/migration/V15__migrate_overall_grade_to_letter_scale.sql \
        scripts/rollback-overall-grade-v15.sql
git commit -m "feat: 진단 등급 3단계->5단계 마이그레이션 및 완전 원복 스크립트 추가"
```

---

## Task 3: `VlmWearDiagnosisEngine` 신규 구현 + 단위테스트

**Files:**
- Create: `src/main/java/com/mcm/passport/diagnosis/VlmWearDiagnosisEngine.java`
- Create: `src/test/java/com/mcm/passport/diagnosis/VlmWearDiagnosisEngineTest.java`
- Modify: `src/main/java/com/mcm/passport/diagnosis/WearDiagnosisEngineConfig.java`

**Interfaces:**
- Consumes: `OverallGrade`(Task 1), `WearDiagnosisEngine` 인터페이스(`diagnose(List<String> imageUrls, Diagnosis previousDiagnosis)`, 기존), `ErrorCode.DEFECT_DETECTION_UNAVAILABLE`/`ErrorCode.DIAGNOSIS_IMAGE_UNREADABLE`(기존).
- Produces: `VlmWearDiagnosisEngine(RestClient.Builder, String defectApiBaseUrl, ObjectMapper)` 생성자 — Task 3 Step 6에서 `WearDiagnosisEngineConfig`가 이 시그니처로 빈을 만듦.

- [ ] **Step 1: 실패하는 테스트부터 작성**

`src/test/java/com/mcm/passport/diagnosis/VlmWearDiagnosisEngineTest.java`:

```java
package com.mcm.passport.diagnosis;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mcm.passport.common.exception.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;

class VlmWearDiagnosisEngineTest {

    private static final String IMAGE_URL = "https://cdn/bag.jpg";
    private static final byte[] FAKE_IMAGE_BYTES = "fake-jpeg-bytes".getBytes();

    @Test
    void mapsVlmReportIntoDiagnosisResult() {
        RestClient.Builder imageBuilder = RestClient.builder();
        MockRestServiceServer imageServer = MockRestServiceServer.bindTo(imageBuilder).build();
        imageServer.expect(requestTo(IMAGE_URL))
            .andExpect(method(HttpMethod.GET))
            .andRespond(withStatus(HttpStatus.OK)
                .contentType(MediaType.IMAGE_JPEG)
                .body(FAKE_IMAGE_BYTES));

        RestClient.Builder defectApiBuilder = RestClient.builder().baseUrl("http://defect-api");
        MockRestServiceServer defectApiServer = MockRestServiceServer.bindTo(defectApiBuilder).build();
        defectApiServer.expect(requestTo("http://defect-api/diagnose"))
            .andExpect(method(HttpMethod.POST))
            .andRespond(withStatus(HttpStatus.OK)
                .contentType(MediaType.APPLICATION_JSON)
                .body("""
                    {
                      "overall_grade": "C",
                      "overall_score": 45.0,
                      "item_scores": {"wear": 45},
                      "item_scores_label_ko": {"마모": 45},
                      "problem_areas": [],
                      "rationale": "손잡이 부분에 마모가 관찰됩니다.",
                      "grade_change": null,
                      "trend": [],
                      "defects": [],
                      "model": "qwen2.5vl:7b"
                    }
                    """));

        VlmWearDiagnosisEngine engine = new TestableVlmWearDiagnosisEngine(
            imageBuilder, defectApiBuilder, "http://defect-api", new ObjectMapper());

        DiagnosisResult result = engine.diagnose(List.of(IMAGE_URL), null);

        assertThat(result.overallGrade()).isEqualTo(OverallGrade.C);
        assertThat(result.itemScores()).isEqualTo(Map.of("마모", 45));
        assertThat(result.evidenceText()).isEqualTo("손잡이 부분에 마모가 관찰됩니다.");
        imageServer.verify();
        defectApiServer.verify();
    }

    @Test
    void translatesOllamaDownToApiException() {
        RestClient.Builder imageBuilder = RestClient.builder();
        MockRestServiceServer imageServer = MockRestServiceServer.bindTo(imageBuilder).build();
        imageServer.expect(requestTo(IMAGE_URL))
            .andExpect(method(HttpMethod.GET))
            .andRespond(withStatus(HttpStatus.OK)
                .contentType(MediaType.IMAGE_JPEG)
                .body(FAKE_IMAGE_BYTES));

        RestClient.Builder defectApiBuilder = RestClient.builder().baseUrl("http://defect-api");
        MockRestServiceServer defectApiServer = MockRestServiceServer.bindTo(defectApiBuilder).build();
        defectApiServer.expect(requestTo("http://defect-api/diagnose"))
            .andExpect(method(HttpMethod.POST))
            .andRespond(withServerError());

        VlmWearDiagnosisEngine engine = new TestableVlmWearDiagnosisEngine(
            imageBuilder, defectApiBuilder, "http://defect-api", new ObjectMapper());

        assertThatThrownBy(() -> engine.diagnose(List.of(IMAGE_URL), null))
            .isInstanceOf(ApiException.class);
    }

    // RestClient.Builder.clone()이 baseUrl/requestFactory를 새로 세팅하면 MockRestServiceServer가
    // 바인딩한 인터셉터가 끊길 수 있어, 프로덕션 생성자(타임아웃 설정용 clone 포함) 대신
    // 테스트에서는 두 RestClient.Builder를 그대로 주입하는 보조 생성자를 하나 더 둔다.
    private static class TestableVlmWearDiagnosisEngine extends VlmWearDiagnosisEngine {
        TestableVlmWearDiagnosisEngine(RestClient.Builder imageBuilder, RestClient.Builder defectApiBuilder,
                                        String defectApiBaseUrl, ObjectMapper objectMapper) {
            super(imageBuilder, defectApiBuilder, defectApiBaseUrl, objectMapper);
        }
    }
}
```

- [ ] **Step 2: 컴파일 확인 (실패해야 정상)**

Run: `./gradlew compileTestJava`
Expected: FAIL — `VlmWearDiagnosisEngine`이 아직 없음 + 테스트가 기대하는 패키지 전용(protected) 생성자가 없음.

- [ ] **Step 3: `VlmWearDiagnosisEngine` 구현**

`src/main/java/com/mcm/passport/diagnosis/VlmWearDiagnosisEngine.java`:

```java
package com.mcm.passport.diagnosis;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mcm.passport.common.exception.ApiException;
import com.mcm.passport.common.exception.ErrorCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

// ml/defect-detection/api_server.py의 /diagnose(VLM 종합 리포트)를 호출하는 WearDiagnosisEngine
// 구현체. wear-diagnosis.engine=vlm일 때 활성화된다(WearDiagnosisEngineConfig 참고 — 기본값).
// /predict만 쓰는 MlWearDiagnosisEngine과 달리 이미지 1장 기준으로 등급까지 한 번에 받는다.
// 여러 장을 보내도 vlm_report.generate_report()가 리포트 여러 개 병합을 지원하지 않아
// 첫 번째 이미지만 사용한다(docs/superpowers/specs/2026-08-17-vlm-grade-integration-design.md 참고).
@Slf4j
public class VlmWearDiagnosisEngine implements WearDiagnosisEngine {

    // MlWearDiagnosisEngine과 동일한 이유 — diagnosis.evidence_text가 VARCHAR(1000)이라
    // 여유를 두고 자른다.
    private static final int MAX_EVIDENCE_LENGTH = 900;

    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(5);
    // VLM 추론(Ollama)은 /predict보다 훨씬 느리다 — vlm_report.query_ollama()가 최대 180초까지 기다린다.
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(180);

    private final RestClient imageDownloadClient;
    private final RestClient defectApiClient;
    private final ObjectMapper objectMapper;

    public VlmWearDiagnosisEngine(RestClient.Builder restClientBuilder, String defectApiBaseUrl,
                                   ObjectMapper objectMapper) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) CONNECT_TIMEOUT.toMillis());
        factory.setReadTimeout((int) READ_TIMEOUT.toMillis());
        this.imageDownloadClient = restClientBuilder.clone().requestFactory(factory).build();
        this.defectApiClient = restClientBuilder.clone()
            .requestFactory(factory)
            .baseUrl(defectApiBaseUrl)
            .build();
        this.objectMapper = objectMapper;
    }

    // 테스트 전용 — MockRestServiceServer를 이미지 다운로드용/ML API용으로 각각 다른
    // RestClient.Builder에 바인딩해야 해서, 프로덕션 생성자의 clone()/baseUrl() 재설정을 우회한다.
    protected VlmWearDiagnosisEngine(RestClient.Builder imageDownloadBuilder, RestClient.Builder defectApiBuilder,
                                      String defectApiBaseUrl, ObjectMapper objectMapper) {
        this.imageDownloadClient = imageDownloadBuilder.build();
        this.defectApiClient = defectApiBuilder.baseUrl(defectApiBaseUrl).build();
        this.objectMapper = objectMapper;
    }

    @Override
    public DiagnosisResult diagnose(List<String> imageUrls, Diagnosis previousDiagnosis) {
        List<String> images = imageUrls == null ? List.of() : imageUrls;
        if (images.isEmpty()) {
            throw new ApiException(ErrorCode.DIAGNOSIS_IMAGE_UNREADABLE);
        }

        byte[] imageBytes = downloadImage(images.get(0));
        String previousDiagnosesJson = buildPreviousDiagnosesJson(previousDiagnosis);
        VlmReport report = callDiagnose(imageBytes, previousDiagnosesJson);

        OverallGrade grade = OverallGrade.valueOf(report.overallGrade());
        Map<String, Integer> scores = new LinkedHashMap<>(report.itemScoresLabelKo());
        String evidence = truncate(report.rationale());

        return new DiagnosisResult(scores, grade, evidence);
    }

    private byte[] downloadImage(String imageUrl) {
        try {
            return imageDownloadClient.get().uri(imageUrl).retrieve().body(byte[].class);
        } catch (RestClientException e) {
            log.error("진단 이미지 다운로드 실패 (url={})", imageUrl, e);
            throw new ApiException(ErrorCode.DEFECT_DETECTION_UNAVAILABLE);
        }
    }

    private String buildPreviousDiagnosesJson(Diagnosis previousDiagnosis) {
        if (previousDiagnosis == null) {
            return "[]";
        }
        double overallScore = previousDiagnosis.getItemScores().values().stream()
            .mapToInt(Integer::intValue).average().orElse(0);
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("date", previousDiagnosis.getDiagnosedAt().toString());
        entry.put("overall_grade", previousDiagnosis.getOverallGrade().name());
        entry.put("overall_score", overallScore);
        try {
            return objectMapper.writeValueAsString(List.of(entry));
        } catch (Exception e) {
            log.warn("이전 진단을 VLM 요청용 JSON으로 직렬화하지 못함 (diagnosisId={})", previousDiagnosis.getId(), e);
            return "[]";
        }
    }

    private VlmReport callDiagnose(byte[] imageBytes, String previousDiagnosesJson) {
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("file", new ByteArrayResource(imageBytes) {
            @Override
            public String getFilename() {
                return "diagnosis.jpg";
            }
        });
        body.add("previous_diagnoses", previousDiagnosesJson);

        try {
            return defectApiClient.post()
                .uri("/diagnose")
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .body(body)
                .retrieve()
                .body(VlmReport.class);
        } catch (HttpClientErrorException e) {
            // 4xx는 api_server.py가 의도적으로 내는 입력 오류다(예: 이미지가 아닌 파일).
            log.warn("VLM 진단 API가 입력 오류를 반환 (status={})", e.getStatusCode());
            throw new ApiException(ErrorCode.DIAGNOSIS_IMAGE_UNREADABLE);
        } catch (RestClientException e) {
            // Ollama가 안 떠 있으면 api_server.py가 503으로 알려준다(ml/defect-detection/README.md
            // 참고) — HttpServerErrorException(5xx)도 RestClientException이라 여기서 같이 잡힌다.
            log.error("VLM 진단 API 호출 실패", e);
            throw new ApiException(ErrorCode.DEFECT_DETECTION_UNAVAILABLE);
        }
    }

    private String truncate(String evidence) {
        if (evidence == null) return "";
        if (evidence.length() <= MAX_EVIDENCE_LENGTH) return evidence;
        return evidence.substring(0, MAX_EVIDENCE_LENGTH - 3) + "...";
    }

    // /diagnose 응답엔 이 3개 말고도 overall_score/item_scores/problem_areas/grade_change/trend/
    // defects/model이 더 있다(스코프 밖, 스펙 참고) — ignoreUnknown 없으면 Jackson이 모르는
    // 필드를 만날 때 기본적으로 예외를 던져서 응답 전체를 못 읽는다.
    @com.fasterxml.jackson.annotation.JsonIgnoreProperties(ignoreUnknown = true)
    private record VlmReport(
        @JsonProperty("overall_grade") String overallGrade,
        @JsonProperty("item_scores_label_ko") Map<String, Integer> itemScoresLabelKo,
        String rationale
    ) {
    }
}
```

- [ ] **Step 4: 테스트 실행 — 통과해야 정상**

Run: `./gradlew test --tests "com.mcm.passport.diagnosis.VlmWearDiagnosisEngineTest"`
Expected: PASS (2개 테스트 모두)

- [ ] **Step 5: `WearDiagnosisEngineConfig`에 `vlm` 빈 추가 + 기본값 이동**

`src/main/java/com/mcm/passport/diagnosis/WearDiagnosisEngineConfig.java` 전체를 아래로 교체:

```java
package com.mcm.passport.diagnosis;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

@Configuration
public class WearDiagnosisEngineConfig {

    @Bean
    @ConditionalOnProperty(name = "wear-diagnosis.engine", havingValue = "rule-based")
    public WearDiagnosisEngine ruleBasedWearDiagnosisEngine() {
        return new RuleBasedWearDiagnosisEngine();
    }

    // ml/defect-detection/api_server.py를 호출하는 구현체. wear-diagnosis.engine=ml일 때만 켜진다.
    @Bean
    @ConditionalOnProperty(name = "wear-diagnosis.engine", havingValue = "ml")
    public WearDiagnosisEngine mlWearDiagnosisEngine(
        RestClient.Builder restClientBuilder,
        @Value("${wear-diagnosis.defect-api-url:http://localhost:8000}") String defectApiUrl
    ) {
        return new MlWearDiagnosisEngine(restClientBuilder, defectApiUrl);
    }

    // 실제 AI(VLM)로 진단하는 게 표준 동작이라 기본값(matchIfMissing)이다. Ollama가 없는
    // 환경에서 앱을 기동하는 것 자체는 안전하다(이 빈은 요청이 올 때만 Ollama를 호출) —
    // 다만 WEAR_DIAGNOSIS_ENGINE을 명시하지 않고 clone하면 실제 진단 제출은 Ollama
    // 없이는 503이 난다. 그 경우 rule-based나 ml로 명시적으로 되돌릴 것
    // (docs/superpowers/specs/2026-08-17-vlm-grade-integration-design.md "롤백 경로" 참고).
    @Bean
    @ConditionalOnProperty(name = "wear-diagnosis.engine", havingValue = "vlm", matchIfMissing = true)
    public WearDiagnosisEngine vlmWearDiagnosisEngine(
        RestClient.Builder restClientBuilder,
        ObjectMapper objectMapper,
        @Value("${wear-diagnosis.defect-api-url:http://localhost:8000}") String defectApiUrl
    ) {
        return new VlmWearDiagnosisEngine(restClientBuilder, defectApiUrl, objectMapper);
    }
}
```

- [ ] **Step 6: 전체 백엔드 테스트 실행 — 통과해야 정상**

Run: `./gradlew test`
Expected: PASS (전체 스위트 — 다른 도메인 테스트가 `wear-diagnosis.engine`을 명시하지 않고 컨텍스트를 띄우는 경우가 있다면, 이제 `vlm` 빈이 기본으로 뜨면서 `RestClient.Builder`/`ObjectMapper` 빈 주입 자체는 문제 없이 되지만 혹시 `@SpringBootTest` 통합 테스트가 진단 제출까지 실제로 수행한다면 Ollama가 없어 503이 날 수 있다 — 그런 실패가 나오면 해당 테스트가 `WEAR_DIAGNOSIS_ENGINE=rule-based`를 명시하도록 `@TestPropertySource`/`application-test.yml`을 추가해야 한다. 이 리포에 그런 통합 테스트가 있는지 이 스텝에서 실제로 실행해 확인한다.)

- [ ] **Step 7: 커밋**

```bash
git add src/main/java/com/mcm/passport/diagnosis/VlmWearDiagnosisEngine.java \
        src/test/java/com/mcm/passport/diagnosis/VlmWearDiagnosisEngineTest.java \
        src/main/java/com/mcm/passport/diagnosis/WearDiagnosisEngineConfig.java
git commit -m "feat: VLM 종합 진단 엔진 연동, 기본 엔진으로 승격"
```

---

## Task 4: Ollama 접속 주소 설정화 + docker-compose/문서 갱신

**Files:**
- Modify: `ml/defect-detection/vlm_report.py`
- Modify: `docker-compose.yml`
- Modify: `.env.example`
- Modify: `ml/defect-detection/README.md`

**Interfaces:**
- Consumes: 없음(설정/문서 전용, Task 1~3의 코드에 의존하지 않음).
- Produces: `OLLAMA_HOST` 환경변수(기본값 `localhost:11434`) — Python `vlm_report.py`와 `docker-compose.yml`의 `defect-detection` 서비스가 공유.

- [ ] **Step 1: `vlm_report.py`의 `OLLAMA_URL`을 환경변수 기반으로**

`ml/defect-detection/vlm_report.py`에서:

```python
OLLAMA_URL = "http://localhost:11434/api/generate"
```

이 줄을:

```python
OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "localhost:11434")
OLLAMA_URL = f"http://{OLLAMA_HOST}/api/generate"
```

로 교체. (`api_server.py:150`이 `vlm_report.OLLAMA_URL`을 그대로 참조하므로 속성 이름은 유지한다.)

- [ ] **Step 2: 문법 확인**

Run: `python3 -c "import ast; ast.parse(open('ml/defect-detection/vlm_report.py').read())"`
Expected: 에러 없이 종료(문법 오류 없음 확인용 — 이 환경엔 vlm_report의 실제 의존성이 없어 import는 못 하므로 문법 파싱만 확인).

- [ ] **Step 3: `docker-compose.yml`에 `OLLAMA_HOST` 전달 + `WEAR_DIAGNOSIS_ENGINE` 기본값 갱신**

`docker-compose.yml`의 `backend` 서비스에서:

```yaml
      WEAR_DIAGNOSIS_ENGINE: ${WEAR_DIAGNOSIS_ENGINE:-rule-based}
```

를:

```yaml
      WEAR_DIAGNOSIS_ENGINE: ${WEAR_DIAGNOSIS_ENGINE:-vlm}
```

로 교체 — Spring 쪽 `matchIfMissing`을 vlm으로 옮겨도, compose가 이 값을 명시적으로 `rule-based`로 채워 넣으면 무의미해지기 때문(도커로 띄우는 게 팀의 기본 개발 경로).

`defect-detection` 서비스 블록에 `environment`를 추가:

```yaml
  defect-detection:
    build: ./ml/defect-detection
    ports:
      - "8000:8000"
    environment:
      OLLAMA_HOST: ${OLLAMA_HOST:-localhost:11434}
```

- [ ] **Step 4: `.env.example`에 항목 추가/갱신**

`.env.example`에서:

```
# 마모 진단 엔진: rule-based(기본, 사진을 보지 않는 자리표시자) 또는 ml(하자 탐지 모델 호출)
WEAR_DIAGNOSIS_ENGINE=rule-based
```

를:

```
# 마모 진단 엔진: vlm(기본, VLM 종합 리포트 — 로컬 Ollama 필요) / ml(하자 탐지 모델만, Ollama 불필요)
# / rule-based(사진을 보지 않는 자리표시자, 롤백용). 자세한 내용은
# docs/superpowers/specs/2026-08-17-vlm-grade-integration-design.md 참고.
WEAR_DIAGNOSIS_ENGINE=vlm

# defect-detection 컨테이너가 접속할 Ollama 주소. 기본값(localhost:11434)은 컨테이너
# 자신의 localhost라 호스트의 Ollama에 안 닿는다 — docker-compose로 띄운 채 vlm 엔진을
# 실제로 쓰려면 host.docker.internal:11434로 바꿀 것(ml/defect-detection/README.md 참고).
OLLAMA_HOST=localhost:11434
```

로 교체.

- [ ] **Step 5: `ml/defect-detection/README.md`의 `/diagnose` 절 갱신**

"## `/diagnose` — VLM 종합 리포트 (Spring 미연동, 선택)" 절 전체를 아래로 교체:

```markdown
## `/diagnose` — VLM 종합 리포트

2026-08-16 핸드오프에서 추가된 엔드포인트. YOLO 탐지 결과 + 원본 이미지를 VLM에 넣어 종합등급
(S/A/B/C/D), 항목별 점수, 판정 근거, 이전 진단 대비 추이를 생성한다.

`VlmWearDiagnosisEngine`이 이 엔드포인트를 호출한다(`wear-diagnosis.engine=vlm`, **기본값**).
자세한 통합 내용은 `docs/superpowers/specs/2026-08-17-vlm-grade-integration-design.md` 참고.

`vlm_report.py`는 **로컬 Ollama**에 의존한다(pip 의존성은 늘지 않음 — stdlib `urllib`만 사용).

```bash
ollama serve
ollama pull qwen2.5vl:7b     # 기본 모델. VLM_MODEL 환경변수로 교체 가능
```

접속 주소는 `OLLAMA_HOST` 환경변수로 바꿀 수 있다(기본값 `localhost:11434`). Docker Compose로
띄울 경우 컨테이너 안의 `localhost`는 호스트를 가리키지 않으므로, `.env`에
`OLLAMA_HOST=host.docker.internal:11434`를 설정해야 컨테이너에서 호스트의 Ollama에 닿는다.

Ollama가 안 떠 있으면 `/diagnose`는 **503**과 함께 원인을 알려준다(그냥 두면 재시도로 30초를
태운 뒤 원인 불명 500이 나가서, 이 래퍼에서 잡아 변환한다). `/predict`는 VLM과 무관하게 동작한다.
이때 백엔드는 `ErrorCode.DEFECT_DETECTION_UNAVAILABLE`(502)로 변환해 클라이언트에 전달한다.
```

또한 같은 파일 "## 실행" 절의 아래 문단:

```
Spring 쪽에서 이 서버를 바라보게 하려면 `application.yml`의 `wear-diagnosis.engine`을 `ml`로 바꾸고
(또는 환경변수 `WEAR_DIAGNOSIS_ENGINE=ml`), 서버 주소가 다르면 `DEFECT_API_URL`을 설정한다.
```

다음 줄을 추가:

```
`wear-diagnosis.engine`의 기본값은 이제 `vlm`이다 — `/predict`만 쓰는 `ml`으로 실행하려면
명시적으로 `WEAR_DIAGNOSIS_ENGINE=ml`을 설정해야 한다.
```

- [ ] **Step 6: 커밋**

```bash
git add ml/defect-detection/vlm_report.py docker-compose.yml .env.example ml/defect-detection/README.md
git commit -m "feat: Ollama 접속 주소 환경변수화, VLM을 기본 엔진으로 문서화"
```

---

## Task 5: 프론트 등급 표기 정리

**Files:**
- Modify: `MCM_Care_Mobile/src/theme.ts`

**Interfaces:**
- Consumes: 백엔드가 이제 `overallGrade`로 `S/A/B/C/D` 문자열을 직접 내려줌(Task 1~3).
- Produces: `gradeLabel(grade)` — 기존 10개 화면이 그대로 호출(시그니처 불변, 내부만 항등 함수로 단순화). `displayGrade`는 `gradeLabel`의 별칭으로 남겨서 `app/diagnosis/result.tsx`는 무변경.

- [ ] **Step 1: `theme.ts`의 등급 관련 부분 교체**

`MCM_Care_Mobile/src/theme.ts`에서 12~39행(등급 매핑 관련 전체)을:

```typescript
// 등급 표기는 현재 두 체계가 공존한다.
//   1) 지금 백엔드가 실제로 주는 값: OverallGrade enum = GOOD / NEEDS_CARE / URGENT
//      (MlWearDiagnosisEngine, RuleBasedWearDiagnosisEngine 둘 다 이 세 값만 낸다)
//   2) VLM 리포트(/diagnose)가 내는 문자 등급: S / A / B / C / D
// 2번은 아직 백엔드에 연동돼 있지 않지만, 연동되면 번역 없이 그대로 보여주면 된다.
// 매핑에 없는 값은 원문 그대로 통과시키므로 두 체계를 모두 안전하게 처리한다.
export const GRADE_LABELS: Record<string, string> = {
  GOOD: "양호",
  NEEDS_CARE: "관리 필요",
  URGENT: "긴급",
};
/* 진단 결과 화면은 S/A/B/C/D 5단계 척도로 등급 추이를 그린다. 그런데 현재 백엔드의
   OverallGrade는 GOOD/NEEDS_CARE/URGENT 3단계뿐이라, 그대로 넣으면 indexOf가 -1이 되어
   모든 진단이 차트 최상단에 찍히고 등급도 "GOOD"이 그대로 노출된다.
   3단계를 5단계 위에 얹어 표시용으로 변환한다. 백엔드가 문자 등급을 직접 주기 시작하면
   (VLM /diagnose 연동) 이 매핑은 통과만 하므로 그대로 두어도 된다. */
const BACKEND_TO_LETTER: Record<string, string> = {
  GOOD: "A",
  NEEDS_CARE: "C",
  URGENT: "D",
};
export function displayGrade(grade: string | null | undefined): string | null {
  if (!grade) return null;
  return BACKEND_TO_LETTER[grade] ?? grade;
}
export function gradeLabel(grade: string | null | undefined) {
  return grade ? (GRADE_LABELS[grade] ?? grade) : null;
}
```

이렇게 교체:

```typescript
// 백엔드가 OverallGrade로 S/A/B/C/D를 그대로 내려준다(2026-08-17 VLM 통합 이후).
// 한글 라벨을 따로 두지 않고 글자 등급을 그대로 보여준다 — 진단 결과 화면(차트)이
// 이미 S/A/B/C/D를 원문 그대로 쓰고 있어서, 목록 화면만 한글로 옮기면 같은 앱 안에서
// 등급 표기가 두 가지로 갈린다.
export function gradeLabel(grade: string | null | undefined) {
  return grade ?? null;
}
// app/diagnosis/result.tsx가 이 이름으로 가져다 쓴다 — gradeLabel과 동작이 같아져서
// 별도 로직 없이 별칭만 남긴다(그 화면 자체는 안 건드림).
export const displayGrade = gradeLabel;
```

- [ ] **Step 2: 타입체크**

Run: `cd MCM_Care_Mobile && npm run typecheck`
Expected: PASS, 에러 없음(`app/diagnosis/result.tsx`는 코드 변경 없이 `displayGrade` import가 계속 유효함).

- [ ] **Step 3: 커밋**

```bash
cd MCM_Care_Mobile
git add src/theme.ts
git commit -m "fix: 등급 표기를 S/A/B/C/D 그대로 노출, 임시 매핑 제거"
```

---

## Task 6: 수동 종단 검증 (Ollama 필요 — 이 환경엔 없어서 별도 확인 필요)

**Files:** 없음(코드 변경 없는 검증 태스크)

**Interfaces:**
- Consumes: Task 1~5 전체.

- [ ] **Step 1: Ollama 준비**

```bash
ollama serve
ollama pull qwen2.5vl:7b
```

- [ ] **Step 2: 스택 기동 (vlm 기본 엔진으로)**

```bash
docker compose up -d db defect-detection ar-identification
./gradlew bootRun
```

Expected: 로그에 `Started PassportApplication`, `V15__migrate_overall_grade_to_letter_scale` 마이그레이션 적용 로그.

- [ ] **Step 3: 진단 제출 종단 확인**

로그인 후 토큰으로 (Task 3 이전 대화에서 쓴 것과 동일한 curl 패턴):

```bash
curl -s -X POST "http://localhost:8080/api/passports/{PASSPORT_ID}/diagnoses?diagnosisType=SELF" \
  -H "Authorization: Bearer $TOKEN" \
  -F "images=@/path/to/bag-photo.jpg;type=image/jpeg"
```

Expected: `201 CREATED` + 응답에 `"overallGrade": "S"`(또는 A/B/C/D 중 하나, `GOOD`/`NEEDS_CARE`/`URGENT` 아님), `evidenceText`에 VLM이 생성한 한국어 판정 근거.

- [ ] **Step 4: Ollama 없이 503이 제대로 나는지 확인**

```bash
# Ollama 프로세스를 잠깐 내린 상태에서 Step 3과 동일한 요청
```

Expected: `502 BAD_GATEWAY` (`ErrorCode.DEFECT_DETECTION_UNAVAILABLE`), 업로드했던 이미지가 Cloudinary에 고아로 안 남는지 확인(`DiagnosisService`의 기존 정리 로직).

- [ ] **Step 5: 롤백 레버 확인**

```bash
WEAR_DIAGNOSIS_ENGINE=rule-based ./gradlew bootRun
```

Expected: 재기동 후 진단 제출이 Ollama 없이도 즉시 성공(rule-based로 동작), `overallGrade`는 여전히 S/A/B/C/D 중 하나.

이 태스크는 커밋할 코드가 없다 — 통과하면 끝, 문제가 발견되면 해당 Task로 돌아가 고친다.
