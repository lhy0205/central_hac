# MCM Nomad Passport 백엔드 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프론트엔드 없이, MCM Nomad Passport의 백엔드(Spring Boot)를 스펙(`docs/superpowers/specs/2026-08-05-mcm-nomad-passport-backend-design.md`)에 정의된 순서(4-1 계정 → 4-2 여권 등록 → 4-3 마모 진단 → 4-4 타이밍 알림 → 4-5 타임라인)대로 구현한다.

**Architecture:** 단일 Spring Boot 모놀리스, 패키지-바이-피처(`account`, `passport`, `diagnosis`, `notification`, `care`, `timeline`, `common`). PostgreSQL + Flyway로 스키마 관리(Hibernate `ddl-auto: validate`). 마모 진단은 `WearDiagnosisEngine` 인터페이스 뒤에 규칙기반 구현체를 두어 나중에 AI 구현체로 교체 가능하게 한다.

**Tech Stack:** Java 17, Spring Boot 3.3.x, Gradle(Groovy DSL) + Foojay 툴체인 리졸버, Spring Data JPA, Flyway, PostgreSQL, Spring Security + JJWT, Cloudinary(`cloudinary-http5`), Lombok, JUnit5 + Mockito + AssertJ, Testcontainers(PostgreSQL).

## Global Constraints

- DB는 PostgreSQL만 사용한다. 테스트에도 H2 대신 Testcontainers로 실제 PostgreSQL을 띄운다 (스펙 9번: "H2 미사용 — 실제 DB 특성과 다르면 나중에 삽질").
- 스키마 변경은 전부 Flyway 마이그레이션(`src/main/resources/db/migration/V{n}__*.sql`)으로 하고, `spring.jpa.hibernate.ddl-auto=validate`로 고정한다 (엔티티가 마이그레이션과 항상 일치해야 함).
- `Passport`의 유니크 제약은 `UNIQUE (serial_number, purchase_year) WHERE status = 'ACTIVE'` 부분 유니크 인덱스로 구현한다 (스펙 4번: 소프트 삭제된 여권은 재등록 허용).
- 시리얼 포맷: 신형 `^[A-Za-z]\d{4}$`, 빈티지 `^\d{4}$` — 사용자가 신형/빈티지를 직접 선택하지 않고 둘 중 하나만 통과하면 유효.
- 이미지 파일(영수증, 베이스라인, 진단 사진)은 Cloudinary에 업로드하고 DB에는 URL 문자열만 저장한다. `Passport.receiptImageUrl`과 `Diagnosis.imageUrls`는 비공개 데이터 — 어떤 공개용 DTO에도 절대 포함하지 않는다.
- 모든 에러 응답은 `{ "code": "...", "message": "..." }` 형식, `@RestControllerAdvice` 전역 처리 (스펙 8번 에러 코드 표 그대로 사용).
- 목록형 API(`diagnoses`, `care-records`, `notifications`, `passports`)는 전부 `page`/`size` 쿼리 파라미터로 페이지네이션한다 (Spring Data `Pageable`/`Page<T>` 그대로 응답).
- 모든 `passport` 하위 리소스 접근은 `Passport.ownerAccountId`가 요청자(JWT의 accountId)와 같은지 검증하고, 다르면 `FORBIDDEN`.
- 패키지 루트는 `com.mcm.passport`.
- 인증이 필요없는 경로는 `/api/auth/**`뿐이며, 나머지는 전부 JWT 필요.

---

## 파일 구조

```
build.gradle
settings.gradle
src/main/resources/application.yml
src/main/resources/db/migration/
├── V1__create_account_tables.sql
├── V2__create_passport_table.sql
├── V3__create_diagnosis_table.sql
├── V4__create_notification_table.sql
├── V5__create_care_record_table.sql
└── V6__create_timeline_event_table.sql

src/main/java/com/mcm/passport/
├── PassportApplication.java              # 메인 클래스
├── common/
│   ├── config/
│   │   ├── SecurityConfig.java           # Spring Security 필터체인
│   │   ├── CloudinaryConfig.java         # Cloudinary 빈 등록
│   │   └── ClockConfig.java              # 테스트 가능한 시간 주입용 Clock 빈
│   ├── security/
│   │   ├── JwtProperties.java            # jwt.* 설정 바인딩
│   │   ├── JwtTokenProvider.java         # 토큰 발급/검증
│   │   ├── JwtAuthenticationFilter.java  # Authorization 헤더 파싱
│   │   └── CurrentAccount.java           # Authentication → accountId 헬퍼
│   ├── exception/
│   │   ├── ErrorCode.java                # 에러코드 + HTTP status + 메시지
│   │   ├── ApiException.java             # 공통 예외
│   │   ├── ErrorResponse.java            # 에러 응답 DTO
│   │   └── GlobalExceptionHandler.java   # @RestControllerAdvice
│   └── storage/
│       ├── ImageStorageService.java          # 업로드 인터페이스
│       └── CloudinaryImageStorageService.java
├── account/
│   ├── Account.java, AccountStatus.java
│   ├── PasswordResetToken.java
│   ├── AccountRepository.java, PasswordResetTokenRepository.java
│   ├── AccountService.java, AccountController.java
│   └── dto/ (SignupRequest, LoginRequest, LoginResponse, AccountResponse,
│             UpdateProfileRequest, PasswordResetRequest, ConfirmPasswordResetRequest)
├── passport/
│   ├── Passport.java, PassportStatus.java, UsageFrequency.java
│   ├── PassportRepository.java, SerialValidator.java
│   ├── PassportService.java, PassportController.java
│   └── dto/ (RegisterPassportRequest, UpdatePassportRequest,
│             PassportResponse, PassportSummaryResponse)
├── diagnosis/
│   ├── Diagnosis.java, DiagnosisType.java, OverallGrade.java
│   ├── DiagnosisRepository.java
│   ├── WearDiagnosisEngine.java, DiagnosisResult.java
│   ├── RuleBasedWearDiagnosisEngine.java, WearDiagnosisEngineConfig.java
│   ├── DiagnosisService.java, DiagnosisController.java
│   └── dto/ (SubmitDiagnosisRequest, DiagnosisResponse)
├── notification/
│   ├── Notification.java, NotificationType.java
│   ├── NotificationRepository.java
│   ├── NotificationService.java, NotificationController.java
│   ├── ReminderScheduler.java
│   └── dto/ (NotificationResponse)
├── care/
│   ├── CareRecord.java, CareRecordRepository.java
│   ├── CareRecordService.java, CareRecordController.java
│   └── dto/ (CreateCareRecordRequest, CareRecordResponse)
└── timeline/
    ├── TimelineEvent.java, TimelineEventRepository.java
    ├── TimelineService.java, TimelineController.java
    └── dto/ (CreateTimelineEventRequest, TimelineEventResponse, TimelineItem)

src/test/java/com/mcm/passport/
├── support/AbstractIntegrationTest.java   # Testcontainers 공통 베이스
└── (각 태스크별 테스트, 아래 태스크에 경로 명시)
```

---

## Task 1: 프로젝트 스캐폴딩 (Gradle + Spring Boot 부팅 확인)

**Files:**
- Create: `settings.gradle`
- Create: `build.gradle`
- Create: `src/main/java/com/mcm/passport/PassportApplication.java`
- Create: `src/main/java/com/mcm/passport/common/HealthController.java`
- Create: `src/main/resources/application.yml`
- Test: `src/test/java/com/mcm/passport/common/HealthControllerTest.java`

**Interfaces:**
- Produces: `GET /api/health` → `200 OK`, body `{"status":"UP"}` — 이후 모든 태스크가 앱이 정상 부팅됨을 전제로 함.

- [ ] **Step 1: `settings.gradle` 작성**

```groovy
plugins {
    id 'org.gradle.toolchains.foojay-resolver-convention' version '0.8.0'
}
rootProject.name = 'mcm-passport-backend'
```

- [ ] **Step 2: `build.gradle` 작성**

```groovy
plugins {
    id 'java'
    id 'org.springframework.boot' version '3.3.4'
    id 'io.spring.dependency-management' version '1.1.6'
}

group = 'com.mcm'
version = '0.0.1-SNAPSHOT'

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(17)
    }
}

repositories { mavenCentral() }

dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-web'
    implementation 'org.springframework.boot:spring-boot-starter-data-jpa'
    implementation 'org.springframework.boot:spring-boot-starter-validation'
    implementation 'org.springframework.boot:spring-boot-starter-security'
    implementation 'org.flywaydb:flyway-core'
    implementation 'org.flywaydb:flyway-database-postgresql'
    implementation 'org.postgresql:postgresql'
    implementation 'io.jsonwebtoken:jjwt-api:0.12.6'
    runtimeOnly 'io.jsonwebtoken:jjwt-impl:0.12.6'
    runtimeOnly 'io.jsonwebtoken:jjwt-jackson:0.12.6'
    implementation 'com.cloudinary:cloudinary-http5:2.0.0'
    compileOnly 'org.projectlombok:lombok'
    annotationProcessor 'org.projectlombok:lombok'
    testImplementation 'org.springframework.boot:spring-boot-starter-test'
    testImplementation 'org.springframework.security:spring-security-test'
    testImplementation 'org.testcontainers:junit-jupiter:1.20.1'
    testImplementation 'org.testcontainers:postgresql:1.20.1'
    testCompileOnly 'org.projectlombok:lombok'
    testAnnotationProcessor 'org.projectlombok:lombok'
}

tasks.named('test') {
    useJUnitPlatform()
}
```

- [ ] **Step 3: `application.yml` 작성**

```yaml
spring:
  datasource:
    url: ${DB_URL:jdbc:postgresql://localhost:5432/mcm_passport}
    username: ${DB_USERNAME:postgres}
    password: ${DB_PASSWORD:postgres}
  jpa:
    hibernate:
      ddl-auto: validate
    open-in-view: false
  flyway:
    enabled: true
  servlet:
    multipart:
      max-file-size: 10MB
      max-request-size: 30MB

jwt:
  secret: ${JWT_SECRET:change-this-secret-change-this-secret-32chars-min}
  expiration-ms: 86400000

cloudinary:
  url: ${CLOUDINARY_URL:cloudinary://key:secret@demo}

notification:
  reminder-threshold-days: 90
  reminder-cooldown-days: 30
```

`multipart.max-file-size`(기본값 1MB)를 그대로 두면 실제 휴대폰 사진(베이스라인 3장, 진단 사진 3장 등)이 대부분 이 한도를 넘겨 업로드가 막힌다 — Task 13/19에서 실제 이미지 업로드를 구현하기 전에 여기서 미리 늘려둔다.

- [ ] **Step 4: 메인 애플리케이션 클래스 작성**

```java
package com.mcm.passport;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class PassportApplication {
    public static void main(String[] args) {
        SpringApplication.run(PassportApplication.class, args);
    }
}
```

- [ ] **Step 5: 헬스체크 컨트롤러 작성**

```java
package com.mcm.passport.common;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.Map;

@RestController
public class HealthController {
    @GetMapping("/api/health")
    public Map<String, String> health() {
        return Map.of("status", "UP");
    }
}
```

- [ ] **Step 6: 테스트 작성**

```java
package com.mcm.passport.common;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = HealthController.class)
class HealthControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void healthReturnsUp() throws Exception {
        mockMvc.perform(get("/api/health"))
            .andExpect(status().isOk())
            .andExpect(content().json("{\"status\":\"UP\"}"));
    }
}
```

- [ ] **Step 7: 테스트 실행해서 통과 확인**

Run: `./gradlew test --tests "com.mcm.passport.common.HealthControllerTest"`
Expected: PASS (스캐폴딩 태스크라 TDD red 단계 없이 진행)

- [ ] **Step 8: 컴파일 확인**

Run: `./gradlew compileJava`
Expected: BUILD SUCCESSFUL

- [ ] **Step 9: 커밋**

```bash
git add settings.gradle build.gradle src/main/java/com/mcm/passport/PassportApplication.java src/main/java/com/mcm/passport/common/HealthController.java src/main/resources/application.yml src/test/java/com/mcm/passport/common/HealthControllerTest.java
git commit -m "chore: scaffold Spring Boot project with health check"
```

---

## Task 2: Testcontainers 기반 통합 테스트 인프라 + Flyway 연결

**Files:**
- Create: `src/test/java/com/mcm/passport/support/AbstractIntegrationTest.java`
- Create: `src/main/resources/db/migration/V1__create_account_tables.sql`
- Test: `src/test/java/com/mcm/passport/support/AbstractIntegrationTestBootTest.java`

**Interfaces:**
- Produces: `AbstractIntegrationTest` — 이후 모든 Repository/Service 통합 테스트가 이 클래스를 `extends`해서 실제 PostgreSQL(Testcontainers)에 붙는다.

- [ ] **Step 1: Flyway 마이그레이션 파일 작성**

```sql
-- V1__create_account_tables.sql
CREATE TABLE account (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    nickname VARCHAR(100),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    withdrawn_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE password_reset_token (
    id BIGSERIAL PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES account(id),
    token VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP
);
```

- [ ] **Step 2: Testcontainers 베이스 클래스 작성**

```java
package com.mcm.passport.support;

import org.junit.jupiter.api.Tag;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Tag("integration")
@Testcontainers
@SpringBootTest
@AutoConfigureMockMvc
public abstract class AbstractIntegrationTest {

    @Container
    static final PostgreSQLContainer<?> POSTGRES =
        new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("mcm_passport_test")
            .withUsername("test")
            .withPassword("test");

    @DynamicPropertySource
    static void registerProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }
}
```

`@AutoConfigureMockMvc`를 베이스 클래스에 붙여둔다 — Task 7, 15, 30에서 `@Autowired private MockMvc mockMvc;`를 쓰는데, 이 애노테이션 없이는 `@SpringBootTest` 컨텍스트에 `MockMvc` 빈이 등록되지 않아 그 테스트들이 전부 기동 실패한다. 여기 한 곳에 붙여두면 이 클래스를 상속하는 모든 통합 테스트에 자동으로 적용된다.

- [ ] **Step 3: 컨텍스트 부팅 확인 테스트 작성**

```java
package com.mcm.passport.support;

import org.junit.jupiter.api.Test;

class AbstractIntegrationTestBootTest extends AbstractIntegrationTest {

    @Test
    void contextLoadsWithRealPostgres() {
        // 상속만 해도 Spring 컨텍스트 + Flyway 마이그레이션이 실제 PostgreSQL
        // 컨테이너에 적용된 채로 뜨는지 확인하는 스모크 테스트
    }
}
```

- [ ] **Step 4: 테스트 실행 (Docker 필요)**

Run: `./gradlew test --tests "com.mcm.passport.support.AbstractIntegrationTestBootTest"`
Expected: PASS — Flyway가 V1 마이그레이션을 컨테이너에 적용하고 컨텍스트가 정상 기동.

- [ ] **Step 5: 커밋**

```bash
git add src/main/resources/db/migration/V1__create_account_tables.sql src/test/java/com/mcm/passport/support/AbstractIntegrationTest.java src/test/java/com/mcm/passport/support/AbstractIntegrationTestBootTest.java
git commit -m "test: add Testcontainers-based integration test base"
```

---

## Task 3: 전역 에러 처리 프레임워크

**Files:**
- Create: `src/main/java/com/mcm/passport/common/exception/ErrorCode.java`
- Create: `src/main/java/com/mcm/passport/common/exception/ApiException.java`
- Create: `src/main/java/com/mcm/passport/common/exception/ErrorResponse.java`
- Create: `src/main/java/com/mcm/passport/common/exception/GlobalExceptionHandler.java`
- Test: `src/test/java/com/mcm/passport/common/exception/GlobalExceptionHandlerTest.java`

**Interfaces:**
- Produces: `ApiException(ErrorCode)`, `ApiException(ErrorCode, String message)` — 이후 모든 도메인 서비스가 검증 실패 시 이 예외를 던진다. `ErrorCode`는 이후 태스크에서 값이 계속 추가된다(각 태스크에서 필요한 값을 이 enum에 더한다).

- [ ] **Step 1: `ErrorCode` 작성 (지금까지 스펙에서 확정된 값만 우선 등록, 이후 태스크에서 계속 추가)**

```java
package com.mcm.passport.common.exception;

import org.springframework.http.HttpStatus;

public enum ErrorCode {
    VALIDATION_ERROR(HttpStatus.BAD_REQUEST, "요청 값이 올바르지 않습니다."),
    EMAIL_ALREADY_EXISTS(HttpStatus.CONFLICT, "이미 사용중인 이메일입니다."),
    INVALID_CREDENTIALS(HttpStatus.UNAUTHORIZED, "이메일 또는 비밀번호가 올바르지 않습니다."),
    UNAUTHORIZED(HttpStatus.UNAUTHORIZED, "인증이 필요합니다."),
    RESET_TOKEN_INVALID(HttpStatus.BAD_REQUEST, "비밀번호 재설정 토큰이 유효하지 않습니다."),
    INVALID_SERIAL_FORMAT(HttpStatus.BAD_REQUEST, "시리얼 번호 형식이 올바르지 않습니다."),
    SERIAL_ALREADY_REGISTERED(HttpStatus.CONFLICT, "이미 등록된 시리얼입니다."),
    PASSPORT_NOT_FOUND(HttpStatus.NOT_FOUND, "여권을 찾을 수 없습니다."),
    FORBIDDEN(HttpStatus.FORBIDDEN, "접근 권한이 없습니다."),
    IMAGE_UPLOAD_FAILED(HttpStatus.BAD_GATEWAY, "이미지 업로드에 실패했습니다."),
    DIAGNOSIS_NOT_FOUND(HttpStatus.NOT_FOUND, "진단 기록을 찾을 수 없습니다."),
    CARE_RECORD_NOT_FOUND(HttpStatus.NOT_FOUND, "케어 기록을 찾을 수 없습니다."),
    TIMELINE_EVENT_NOT_FOUND(HttpStatus.NOT_FOUND, "타임라인 이벤트를 찾을 수 없습니다."),
    NOTIFICATION_NOT_FOUND(HttpStatus.NOT_FOUND, "알림을 찾을 수 없습니다.");

    private final HttpStatus status;
    private final String message;

    ErrorCode(HttpStatus status, String message) {
        this.status = status;
        this.message = message;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getMessage() {
        return message;
    }
}
```

- [ ] **Step 2: `ApiException`, `ErrorResponse` 작성**

```java
package com.mcm.passport.common.exception;

public class ApiException extends RuntimeException {
    private final ErrorCode errorCode;

    public ApiException(ErrorCode errorCode) {
        super(errorCode.getMessage());
        this.errorCode = errorCode;
    }

    public ApiException(ErrorCode errorCode, String message) {
        super(message);
        this.errorCode = errorCode;
    }

    public ErrorCode getErrorCode() {
        return errorCode;
    }
}
```

```java
package com.mcm.passport.common.exception;

public record ErrorResponse(String code, String message) {
}
```

- [ ] **Step 3: 테스트용 임시 컨트롤러 + `GlobalExceptionHandler` 실패 테스트 작성**

```java
package com.mcm.passport.common.exception;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = GlobalExceptionHandlerTest.TestController.class)
class GlobalExceptionHandlerTest {

    @Autowired
    private MockMvc mockMvc;

    @RestController
    static class TestController {
        @GetMapping("/api/test/boom")
        public void boom() {
            throw new ApiException(ErrorCode.PASSPORT_NOT_FOUND);
        }
    }

    @Test
    void apiExceptionMapsToErrorResponse() throws Exception {
        mockMvc.perform(get("/api/test/boom"))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("PASSPORT_NOT_FOUND"))
            .andExpect(jsonPath("$.message").value("여권을 찾을 수 없습니다."));
    }
}
```

- [ ] **Step 4: 테스트 실행해서 실패 확인**

Run: `./gradlew test --tests "com.mcm.passport.common.exception.GlobalExceptionHandlerTest"`
Expected: FAIL — `@RestControllerAdvice`가 없어서 500 Internal Server Error로 응답됨 (404 기대와 불일치)

- [ ] **Step 5: `GlobalExceptionHandler` 구현**

```java
package com.mcm.passport.common.exception;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.stream.Collectors;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ErrorResponse> handleApiException(ApiException e) {
        return ResponseEntity.status(e.getErrorCode().getStatus())
            .body(new ErrorResponse(e.getErrorCode().name(), e.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException e) {
        String detail = e.getBindingResult().getFieldErrors().stream()
            .map(f -> f.getField() + ": " + f.getDefaultMessage())
            .collect(Collectors.joining(", "));
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
            .body(new ErrorResponse(ErrorCode.VALIDATION_ERROR.name(), detail));
    }
}
```

- [ ] **Step 6: 테스트 재실행해서 통과 확인**

Run: `./gradlew test --tests "com.mcm.passport.common.exception.GlobalExceptionHandlerTest"`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add src/main/java/com/mcm/passport/common/exception/ src/test/java/com/mcm/passport/common/exception/
git commit -m "feat: add global exception handling framework"
```

---

## Task 4: Account 엔티티 + 리포지토리

**Files:**
- Create: `src/main/java/com/mcm/passport/account/AccountStatus.java`
- Create: `src/main/java/com/mcm/passport/account/Account.java`
- Create: `src/main/java/com/mcm/passport/account/PasswordResetToken.java`
- Create: `src/main/java/com/mcm/passport/account/AccountRepository.java`
- Create: `src/main/java/com/mcm/passport/account/PasswordResetTokenRepository.java`
- Test: `src/test/java/com/mcm/passport/account/AccountRepositoryTest.java`

**Interfaces:**
- Produces: `Account(String email, String passwordHash, String nickname)` 생성자, `account.withdraw()`, `account.changeNickname(String)`. `AccountRepository.findByEmail(String)`, `existsByEmail(String)`.

- [ ] **Step 1: `AccountStatus` enum 작성**

```java
package com.mcm.passport.account;

public enum AccountStatus {
    ACTIVE, WITHDRAWN
}
```

- [ ] **Step 2: `Account` 엔티티 작성**

```java
package com.mcm.passport.account;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "account")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Account {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    private String nickname;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private AccountStatus status;

    @Column(name = "withdrawn_at")
    private LocalDateTime withdrawnAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public Account(String email, String passwordHash, String nickname) {
        this.email = email;
        this.passwordHash = passwordHash;
        this.nickname = nickname;
        this.status = AccountStatus.ACTIVE;
    }

    @PrePersist
    void prePersist() {
        this.createdAt = LocalDateTime.now();
    }

    public void changeNickname(String nickname) {
        this.nickname = nickname;
    }

    public void withdraw() {
        this.status = AccountStatus.WITHDRAWN;
        this.withdrawnAt = LocalDateTime.now();
    }

    public boolean isActive() {
        return this.status == AccountStatus.ACTIVE;
    }
}
```

- [ ] **Step 3: `PasswordResetToken` 엔티티 작성**

```java
package com.mcm.passport.account;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "password_reset_token")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PasswordResetToken {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "account_id", nullable = false)
    private Long accountId;

    @Column(nullable = false, unique = true)
    private String token;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @Column(name = "used_at")
    private LocalDateTime usedAt;

    public PasswordResetToken(Long accountId, String token, LocalDateTime expiresAt) {
        this.accountId = accountId;
        this.token = token;
        this.expiresAt = expiresAt;
    }

    public boolean isUsable(LocalDateTime now) {
        return usedAt == null && expiresAt.isAfter(now);
    }

    public void markUsed() {
        this.usedAt = LocalDateTime.now();
    }
}
```

- [ ] **Step 4: 리포지토리 작성**

```java
package com.mcm.passport.account;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface AccountRepository extends JpaRepository<Account, Long> {
    Optional<Account> findByEmail(String email);
    boolean existsByEmail(String email);
}
```

```java
package com.mcm.passport.account;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetToken, Long> {
    Optional<PasswordResetToken> findByToken(String token);
}
```

- [ ] **Step 5: 실패하는 통합 테스트 작성 (엔티티 저장 전이라 컴파일부터 실패)**

```java
package com.mcm.passport.account;

import com.mcm.passport.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import static org.assertj.core.api.Assertions.assertThat;

class AccountRepositoryTest extends AbstractIntegrationTest {

    @Autowired
    private AccountRepository accountRepository;

    @Test
    void savesAndFindsByEmail() {
        Account account = new Account("user@example.com", "hashed-pw", "닉네임");

        accountRepository.save(account);

        assertThat(accountRepository.existsByEmail("user@example.com")).isTrue();
        assertThat(accountRepository.findByEmail("user@example.com"))
            .isPresent()
            .get()
            .extracting(Account::getNickname)
            .isEqualTo("닉네임");
    }

    @Test
    void findByEmailReturnsEmptyWhenNotFound() {
        assertThat(accountRepository.findByEmail("nobody@example.com")).isEmpty();
    }
}
```

- [ ] **Step 6: 테스트 실행 (파일이 다 있으므로 바로 통과 확인, red 단계는 이 태스크 이전엔 엔티티 자체가 없었다는 점으로 대체)**

Run: `./gradlew test --tests "com.mcm.passport.account.AccountRepositoryTest"`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add src/main/java/com/mcm/passport/account/AccountStatus.java src/main/java/com/mcm/passport/account/Account.java src/main/java/com/mcm/passport/account/PasswordResetToken.java src/main/java/com/mcm/passport/account/AccountRepository.java src/main/java/com/mcm/passport/account/PasswordResetTokenRepository.java src/test/java/com/mcm/passport/account/AccountRepositoryTest.java
git commit -m "feat: add Account and PasswordResetToken entities"
```

---

## Task 5: 회원가입 (POST /api/auth/signup)

**Files:**
- Create: `src/main/java/com/mcm/passport/account/dto/SignupRequest.java`
- Create: `src/main/java/com/mcm/passport/account/dto/AccountResponse.java`
- Create: `src/main/java/com/mcm/passport/account/AccountService.java`
- Create: `src/main/java/com/mcm/passport/account/AccountController.java`
- Modify: `src/main/java/com/mcm/passport/common/exception/ErrorCode.java` (이미 `EMAIL_ALREADY_EXISTS` 있음 — 추가 불필요)
- Test: `src/test/java/com/mcm/passport/account/AccountServiceTest.java`

**Interfaces:**
- Consumes: `AccountRepository` (Task 4), `PasswordEncoder` (Task 6에서 빈 등록 예정 — 이 태스크에서는 임시로 `BCryptPasswordEncoder`를 직접 `new`해서 사용하고, Task 6에서 빈으로 교체)
- Produces: `AccountService.signup(SignupRequest): AccountResponse`, `POST /api/auth/signup`

- [ ] **Step 1: DTO 작성**

```java
package com.mcm.passport.account.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SignupRequest(
    @Email @NotBlank String email,
    @NotBlank @Size(min = 8, max = 100) String password,
    @NotBlank String nickname
) {
}
```

```java
package com.mcm.passport.account.dto;

import com.mcm.passport.account.Account;

import java.time.LocalDateTime;

public record AccountResponse(
    Long id,
    String email,
    String nickname,
    LocalDateTime createdAt
) {
    public static AccountResponse from(Account account) {
        return new AccountResponse(
            account.getId(),
            account.getEmail(),
            account.getNickname(),
            account.getCreatedAt()
        );
    }
}
```

- [ ] **Step 2: 실패하는 서비스 테스트 작성**

```java
package com.mcm.passport.account;

import com.mcm.passport.account.dto.AccountResponse;
import com.mcm.passport.account.dto.SignupRequest;
import com.mcm.passport.common.exception.ApiException;
import com.mcm.passport.common.exception.ErrorCode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AccountServiceTest {

    @Mock
    private AccountRepository accountRepository;

    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    private AccountService accountService;

    @Test
    void signupCreatesAccountWithHashedPassword() {
        accountService = new AccountService(accountRepository, passwordEncoder);
        when(accountRepository.existsByEmail("user@example.com")).thenReturn(false);
        when(accountRepository.save(any(Account.class))).thenAnswer(inv -> inv.getArgument(0));

        AccountResponse response = accountService.signup(
            new SignupRequest("user@example.com", "password123", "닉네임"));

        assertThat(response.email()).isEqualTo("user@example.com");
        assertThat(response.nickname()).isEqualTo("닉네임");
        verify(accountRepository).save(any(Account.class));
    }

    @Test
    void signupRejectsDuplicateEmail() {
        accountService = new AccountService(accountRepository, passwordEncoder);
        when(accountRepository.existsByEmail("dup@example.com")).thenReturn(true);

        assertThatThrownBy(() -> accountService.signup(
                new SignupRequest("dup@example.com", "password123", "닉네임")))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.EMAIL_ALREADY_EXISTS);
    }
}
```

- [ ] **Step 3: 테스트 실행해서 실패 확인**

Run: `./gradlew test --tests "com.mcm.passport.account.AccountServiceTest"`
Expected: FAIL — `AccountService` 클래스가 없어 컴파일 에러

- [ ] **Step 4: `AccountService.signup` 구현**

```java
package com.mcm.passport.account;

import com.mcm.passport.account.dto.AccountResponse;
import com.mcm.passport.account.dto.SignupRequest;
import com.mcm.passport.common.exception.ApiException;
import com.mcm.passport.common.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class AccountService {

    private final AccountRepository accountRepository;
    private final PasswordEncoder passwordEncoder;

    public AccountResponse signup(SignupRequest request) {
        if (accountRepository.existsByEmail(request.email())) {
            throw new ApiException(ErrorCode.EMAIL_ALREADY_EXISTS);
        }
        Account account = new Account(
            request.email(),
            passwordEncoder.encode(request.password()),
            request.nickname()
        );
        return AccountResponse.from(accountRepository.save(account));
    }
}
```

- [ ] **Step 5: 테스트 재실행해서 통과 확인**

Run: `./gradlew test --tests "com.mcm.passport.account.AccountServiceTest"`
Expected: PASS

- [ ] **Step 6: 컨트롤러 작성 (아직 `PasswordEncoder` 빈이 없으므로 임시 `@Bean` 등록 — Task 6에서 SecurityConfig로 이전)**

```java
package com.mcm.passport.account;

import com.mcm.passport.account.dto.AccountResponse;
import com.mcm.passport.account.dto.SignupRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class AccountController {

    private final AccountService accountService;

    @PostMapping("/auth/signup")
    public ResponseEntity<AccountResponse> signup(@Valid @RequestBody SignupRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(accountService.signup(request));
    }
}
```

```java
package com.mcm.passport.common.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration
public class PasswordEncoderConfig {
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
```

- [ ] **Step 7: 컴파일 확인**

Run: `./gradlew compileJava`
Expected: BUILD SUCCESSFUL

- [ ] **Step 8: 커밋**

```bash
git add src/main/java/com/mcm/passport/account/ src/main/java/com/mcm/passport/common/config/PasswordEncoderConfig.java src/test/java/com/mcm/passport/account/AccountServiceTest.java
git commit -m "feat: add signup endpoint"
```

---

## Task 6: JWT 인프라 + 로그인 (POST /api/auth/login)

**Files:**
- Create: `src/main/java/com/mcm/passport/common/security/JwtProperties.java`
- Create: `src/main/java/com/mcm/passport/common/security/JwtTokenProvider.java`
- Create: `src/main/java/com/mcm/passport/common/security/JwtAuthenticationFilter.java`
- Create: `src/main/java/com/mcm/passport/common/security/CurrentAccount.java`
- Create: `src/main/java/com/mcm/passport/common/config/SecurityConfig.java`
- Delete: `src/main/java/com/mcm/passport/common/config/PasswordEncoderConfig.java` (내용을 `SecurityConfig`로 흡수)
- Modify: `src/main/java/com/mcm/passport/common/exception/ErrorCode.java` (변경 없음, `INVALID_CREDENTIALS`/`UNAUTHORIZED` 이미 존재)
- Create: `src/main/java/com/mcm/passport/account/dto/LoginRequest.java`
- Create: `src/main/java/com/mcm/passport/account/dto/LoginResponse.java`
- Modify: `src/main/java/com/mcm/passport/account/AccountService.java` (login 메서드 추가)
- Modify: `src/main/java/com/mcm/passport/account/AccountController.java` (login 엔드포인트 추가)
- Test: `src/test/java/com/mcm/passport/common/security/JwtTokenProviderTest.java`
- Test: `src/test/java/com/mcm/passport/account/AccountServiceTest.java` (login 테스트 추가)

**Interfaces:**
- Produces: `JwtTokenProvider.generateToken(Long accountId): String`, `JwtTokenProvider.getAccountId(String token): Long`, `JwtTokenProvider.isValid(String token): boolean`, `CurrentAccount.id(Authentication): Long` — 이후 모든 인증 필요 컨트롤러가 `Authentication` 파라미터 + `CurrentAccount.id(authentication)`로 accountId를 얻는다.

- [ ] **Step 1: `JwtProperties` 작성**

```java
package com.mcm.passport.common.security;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "jwt")
public record JwtProperties(String secret, long expirationMs) {
}
```

- [ ] **Step 2: `JwtTokenProvider` 실패하는 테스트 작성**

```java
package com.mcm.passport.common.security;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class JwtTokenProviderTest {

    private final JwtTokenProvider provider = new JwtTokenProvider(
        new JwtProperties("test-secret-key-must-be-at-least-32-bytes-long", 60_000));

    @Test
    void generatesAndParsesToken() {
        String token = provider.generateToken(42L);

        assertThat(provider.isValid(token)).isTrue();
        assertThat(provider.getAccountId(token)).isEqualTo(42L);
    }

    @Test
    void invalidTokenIsRejected() {
        assertThat(provider.isValid("garbage-token")).isFalse();
    }
}
```

- [ ] **Step 3: 테스트 실행해서 실패 확인**

Run: `./gradlew test --tests "com.mcm.passport.common.security.JwtTokenProviderTest"`
Expected: FAIL — `JwtTokenProvider` 클래스 없음

- [ ] **Step 4: `JwtTokenProvider` 구현**

```java
package com.mcm.passport.common.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

@Component
public class JwtTokenProvider {

    private final SecretKey key;
    private final long expirationMs;

    public JwtTokenProvider(JwtProperties properties) {
        this.key = Keys.hmacShaKeyFor(properties.secret().getBytes(StandardCharsets.UTF_8));
        this.expirationMs = properties.expirationMs();
    }

    public String generateToken(Long accountId) {
        Date now = new Date();
        Date expiry = new Date(now.getTime() + expirationMs);
        return Jwts.builder()
            .subject(String.valueOf(accountId))
            .issuedAt(now)
            .expiration(expiry)
            .signWith(key)
            .compact();
    }

    public Long getAccountId(String token) {
        Claims claims = Jwts.parser().verifyWith(key).build()
            .parseSignedClaims(token).getPayload();
        return Long.valueOf(claims.getSubject());
    }

    public boolean isValid(String token) {
        try {
            Jwts.parser().verifyWith(key).build().parseSignedClaims(token);
            return true;
        } catch (JwtException | IllegalArgumentException e) {
            return false;
        }
    }
}
```

- [ ] **Step 5: 테스트 재실행해서 통과 확인**

Run: `./gradlew test --tests "com.mcm.passport.common.security.JwtTokenProviderTest"`
Expected: PASS

- [ ] **Step 6: `JwtAuthenticationFilter`, `CurrentAccount` 작성**

```java
package com.mcm.passport.common.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtTokenProvider jwtTokenProvider;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            String token = header.substring(7);
            if (jwtTokenProvider.isValid(token)) {
                Long accountId = jwtTokenProvider.getAccountId(token);
                var authentication = new UsernamePasswordAuthenticationToken(
                    String.valueOf(accountId), null, List.of());
                SecurityContextHolder.getContext().setAuthentication(authentication);
            }
        }
        chain.doFilter(request, response);
    }
}
```

```java
package com.mcm.passport.common.security;

import org.springframework.security.core.Authentication;

public final class CurrentAccount {

    private CurrentAccount() {
    }

    public static Long id(Authentication authentication) {
        return Long.valueOf(authentication.getName());
    }
}
```

- [ ] **Step 7: `SecurityConfig` 작성 (PasswordEncoderConfig의 빈을 흡수)**

```java
package com.mcm.passport.common.config;

import com.mcm.passport.common.security.JwtAuthenticationFilter;
import com.mcm.passport.common.security.JwtTokenProvider;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtTokenProvider jwtTokenProvider;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(AbstractHttpConfigurer::disable)
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/auth/**", "/api/health").permitAll()
                .anyRequest().authenticated())
            .exceptionHandling(e -> e.authenticationEntryPoint((req, res, ex) -> {
                res.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                res.setContentType("application/json");
                res.getWriter().write("{\"code\":\"UNAUTHORIZED\",\"message\":\"인증이 필요합니다.\"}");
            }))
            .addFilterBefore(new JwtAuthenticationFilter(jwtTokenProvider),
                UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
```

- [ ] **Step 8: 기존 `PasswordEncoderConfig` 삭제**

```bash
git rm src/main/java/com/mcm/passport/common/config/PasswordEncoderConfig.java
```

- [ ] **Step 9: 로그인 DTO 작성**

```java
package com.mcm.passport.account.dto;

import jakarta.validation.constraints.NotBlank;

public record LoginRequest(@NotBlank String email, @NotBlank String password) {
}
```

```java
package com.mcm.passport.account.dto;

public record LoginResponse(String accessToken, AccountResponse account) {
}
```

- [ ] **Step 10: `AccountService.login` 실패하는 테스트 추가 (기존 `AccountServiceTest`에 메서드 추가)**

```java
    @Test
    void loginSucceedsWithCorrectCredentials() {
        JwtTokenProvider jwtTokenProvider = new JwtTokenProvider(
            new JwtProperties("test-secret-key-must-be-at-least-32-bytes-long", 60_000));
        accountService = new AccountService(accountRepository, passwordEncoder, jwtTokenProvider);
        Account account = new Account("user@example.com",
            passwordEncoder.encode("password123"), "닉네임");
        when(accountRepository.findByEmail("user@example.com")).thenReturn(java.util.Optional.of(account));

        LoginResponse response = accountService.login(new LoginRequest("user@example.com", "password123"));

        assertThat(response.accessToken()).isNotBlank();
        assertThat(response.account().email()).isEqualTo("user@example.com");
    }

    @Test
    void loginFailsWithWrongPassword() {
        JwtTokenProvider jwtTokenProvider = new JwtTokenProvider(
            new JwtProperties("test-secret-key-must-be-at-least-32-bytes-long", 60_000));
        accountService = new AccountService(accountRepository, passwordEncoder, jwtTokenProvider);
        Account account = new Account("user@example.com",
            passwordEncoder.encode("password123"), "닉네임");
        when(accountRepository.findByEmail("user@example.com")).thenReturn(java.util.Optional.of(account));

        assertThatThrownBy(() -> accountService.login(new LoginRequest("user@example.com", "wrong-password")))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.INVALID_CREDENTIALS);
    }
```

(파일 상단 import에 `com.mcm.passport.account.dto.LoginRequest`, `LoginResponse`, `com.mcm.passport.common.security.JwtProperties`, `JwtTokenProvider` 추가)

**주의:** `AccountService` 생성자에 `JwtTokenProvider` 파라미터가 추가되므로, Task 5에서 작성한 기존 두 테스트(`signupCreatesAccountWithHashedPassword`, `signupRejectsDuplicateEmail`)의 `new AccountService(accountRepository, passwordEncoder)` 호출도 `new AccountService(accountRepository, passwordEncoder, new JwtTokenProvider(new JwtProperties("test-secret-key-must-be-at-least-32-bytes-long", 60_000)))`로 함께 수정한다.

- [ ] **Step 11: 테스트 실행해서 실패 확인**

Run: `./gradlew test --tests "com.mcm.passport.account.AccountServiceTest"`
Expected: FAIL — `AccountService` 생성자에 `JwtTokenProvider` 파라미터가 없어 컴파일 에러

- [ ] **Step 12: `AccountService`에 `login` 메서드 추가 (생성자 시그니처 변경)**

```java
package com.mcm.passport.account;

import com.mcm.passport.account.dto.AccountResponse;
import com.mcm.passport.account.dto.LoginRequest;
import com.mcm.passport.account.dto.LoginResponse;
import com.mcm.passport.account.dto.SignupRequest;
import com.mcm.passport.common.exception.ApiException;
import com.mcm.passport.common.exception.ErrorCode;
import com.mcm.passport.common.security.JwtTokenProvider;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class AccountService {

    private final AccountRepository accountRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;

    public AccountResponse signup(SignupRequest request) {
        if (accountRepository.existsByEmail(request.email())) {
            throw new ApiException(ErrorCode.EMAIL_ALREADY_EXISTS);
        }
        Account account = new Account(
            request.email(),
            passwordEncoder.encode(request.password()),
            request.nickname()
        );
        return AccountResponse.from(accountRepository.save(account));
    }

    public LoginResponse login(LoginRequest request) {
        Account account = accountRepository.findByEmail(request.email())
            .filter(Account::isActive)
            .orElseThrow(() -> new ApiException(ErrorCode.INVALID_CREDENTIALS));
        if (!passwordEncoder.matches(request.password(), account.getPasswordHash())) {
            throw new ApiException(ErrorCode.INVALID_CREDENTIALS);
        }
        String token = jwtTokenProvider.generateToken(account.getId());
        return new LoginResponse(token, AccountResponse.from(account));
    }
}
```

- [ ] **Step 13: 테스트 재실행해서 통과 확인**

Run: `./gradlew test --tests "com.mcm.passport.account.AccountServiceTest"`
Expected: PASS

- [ ] **Step 14: 컨트롤러에 로그인 엔드포인트 추가**

```java
package com.mcm.passport.account;

import com.mcm.passport.account.dto.AccountResponse;
import com.mcm.passport.account.dto.LoginRequest;
import com.mcm.passport.account.dto.LoginResponse;
import com.mcm.passport.account.dto.SignupRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class AccountController {

    private final AccountService accountService;

    @PostMapping("/auth/signup")
    public ResponseEntity<AccountResponse> signup(@Valid @RequestBody SignupRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(accountService.signup(request));
    }

    @PostMapping("/auth/login")
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        return ResponseEntity.ok(accountService.login(request));
    }
}
```

- [ ] **Step 15: 컴파일 확인 후 커밋**

Run: `./gradlew compileJava compileTestJava`
Expected: BUILD SUCCESSFUL

```bash
git add src/main/java/com/mcm/passport/common/security/ src/main/java/com/mcm/passport/common/config/SecurityConfig.java src/main/java/com/mcm/passport/account/ src/test/java/com/mcm/passport/common/security/JwtTokenProviderTest.java src/test/java/com/mcm/passport/account/AccountServiceTest.java
git commit -m "feat: add JWT infrastructure and login endpoint"
```

---

## Task 7: 내 프로필 조회/수정 (GET, PATCH /api/account/me)

**Files:**
- Create: `src/main/java/com/mcm/passport/account/dto/UpdateProfileRequest.java`
- Modify: `src/main/java/com/mcm/passport/account/AccountService.java` (`getMe`, `updateProfile` 추가)
- Modify: `src/main/java/com/mcm/passport/account/AccountController.java` (엔드포인트 추가)
- Modify: `src/main/java/com/mcm/passport/common/exception/ErrorCode.java` (`ACCOUNT_NOT_FOUND` 추가)
- Test: `src/test/java/com/mcm/passport/account/AccountServiceTest.java` (테스트 추가)
- Test: `src/test/java/com/mcm/passport/account/AccountControllerIntegrationTest.java`

**Interfaces:**
- Consumes: `CurrentAccount.id(Authentication)` (Task 6)
- Produces: `AccountService.getMe(Long accountId): AccountResponse`, `AccountService.updateProfile(Long accountId, UpdateProfileRequest): AccountResponse`

- [ ] **Step 1: `ErrorCode`에 `ACCOUNT_NOT_FOUND` 추가**

```java
    ACCOUNT_NOT_FOUND(HttpStatus.NOT_FOUND, "계정을 찾을 수 없습니다."),
```
(`NOTIFICATION_NOT_FOUND` 다음 줄에 추가, 세미콜론 위치 조정)

- [ ] **Step 2: `UpdateProfileRequest` 작성**

```java
package com.mcm.passport.account.dto;

import jakarta.validation.constraints.NotBlank;

public record UpdateProfileRequest(@NotBlank String nickname) {
}
```

- [ ] **Step 3: `AccountServiceTest`에 실패하는 테스트 추가**

```java
    @Test
    void getMeReturnsAccount() {
        accountService = new AccountService(accountRepository, passwordEncoder, jwtTokenProvider());
        Account account = new Account("user@example.com", "hash", "닉네임");
        when(accountRepository.findById(1L)).thenReturn(java.util.Optional.of(account));

        AccountResponse response = accountService.getMe(1L);

        assertThat(response.nickname()).isEqualTo("닉네임");
    }

    @Test
    void updateProfileChangesNickname() {
        accountService = new AccountService(accountRepository, passwordEncoder, jwtTokenProvider());
        Account account = new Account("user@example.com", "hash", "이전닉네임");
        when(accountRepository.findById(1L)).thenReturn(java.util.Optional.of(account));

        AccountResponse response = accountService.updateProfile(1L, new UpdateProfileRequest("새닉네임"));

        assertThat(response.nickname()).isEqualTo("새닉네임");
    }

    private JwtTokenProvider jwtTokenProvider() {
        return new JwtTokenProvider(
            new JwtProperties("test-secret-key-must-be-at-least-32-bytes-long", 60_000));
    }
```

(기존 테스트의 `new JwtTokenProvider(...)` 반복 생성 부분을 이 헬퍼 메서드로 교체해도 됨. import에 `UpdateProfileRequest` 추가)

- [ ] **Step 4: 테스트 실행해서 실패 확인**

Run: `./gradlew test --tests "com.mcm.passport.account.AccountServiceTest"`
Expected: FAIL — `getMe`, `updateProfile` 메서드 없음

- [ ] **Step 5: `AccountService`에 메서드 추가**

```java
    public AccountResponse getMe(Long accountId) {
        return AccountResponse.from(getActiveAccountOrThrow(accountId));
    }

    public AccountResponse updateProfile(Long accountId, UpdateProfileRequest request) {
        Account account = getActiveAccountOrThrow(accountId);
        account.changeNickname(request.nickname());
        return AccountResponse.from(account);
    }

    private Account getActiveAccountOrThrow(Long accountId) {
        return accountRepository.findById(accountId)
            .orElseThrow(() -> new ApiException(ErrorCode.ACCOUNT_NOT_FOUND));
    }
```

(클래스 상단 import에 `com.mcm.passport.account.dto.UpdateProfileRequest` 추가)

- [ ] **Step 6: 테스트 재실행해서 통과 확인**

Run: `./gradlew test --tests "com.mcm.passport.account.AccountServiceTest"`
Expected: PASS

- [ ] **Step 7: 컨트롤러에 엔드포인트 추가**

```java
    @GetMapping("/account/me")
    public ResponseEntity<AccountResponse> getMe(Authentication authentication) {
        return ResponseEntity.ok(accountService.getMe(CurrentAccount.id(authentication)));
    }

    @PatchMapping("/account/me")
    public ResponseEntity<AccountResponse> updateMe(
            Authentication authentication, @Valid @RequestBody UpdateProfileRequest request) {
        return ResponseEntity.ok(accountService.updateProfile(CurrentAccount.id(authentication), request));
    }
```

(상단 import에 `org.springframework.security.core.Authentication`, `com.mcm.passport.common.security.CurrentAccount`, `com.mcm.passport.account.dto.UpdateProfileRequest` 추가)

- [ ] **Step 8: 인증 없이/있이 접근하는 통합 테스트 작성**

```java
package com.mcm.passport.account;

import com.mcm.passport.common.security.JwtProperties;
import com.mcm.passport.common.security.JwtTokenProvider;
import com.mcm.passport.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class AccountControllerIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private AccountRepository accountRepository;
    @Autowired
    private PasswordEncoder passwordEncoder;
    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Test
    void meWithoutTokenReturns401() throws Exception {
        mockMvc.perform(get("/api/account/me"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    @Test
    void meWithValidTokenReturns200() throws Exception {
        Account account = accountRepository.save(
            new Account("me@example.com", passwordEncoder.encode("password123"), "닉네임"));
        String token = jwtTokenProvider.generateToken(account.getId());

        mockMvc.perform(get("/api/account/me").header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.email").value("me@example.com"));
    }
}
```

- [ ] **Step 9: 테스트 실행 (Docker 필요)**

Run: `./gradlew test --tests "com.mcm.passport.account.AccountControllerIntegrationTest"`
Expected: PASS

- [ ] **Step 10: 커밋**

```bash
git add src/main/java/com/mcm/passport/account/ src/main/java/com/mcm/passport/common/exception/ErrorCode.java src/test/java/com/mcm/passport/account/
git commit -m "feat: add account profile get/update endpoints"
```

---

## Task 8: 비밀번호 재설정 (POST /api/auth/password-reset, /confirm)

**Files:**
- Create: `src/main/java/com/mcm/passport/account/dto/PasswordResetRequest.java`
- Create: `src/main/java/com/mcm/passport/account/dto/ConfirmPasswordResetRequest.java`
- Modify: `src/main/java/com/mcm/passport/account/AccountService.java` (`requestPasswordReset`, `confirmPasswordReset` 추가)
- Modify: `src/main/java/com/mcm/passport/account/AccountController.java` (엔드포인트 추가)
- Test: `src/test/java/com/mcm/passport/account/AccountServiceTest.java` (테스트 추가)

**Interfaces:**
- Produces: `AccountService.requestPasswordReset(String email): void`, `AccountService.confirmPasswordReset(ConfirmPasswordResetRequest): void`. 이메일 발송은 실제로 보내지 않고 로그로만 남기는 `stub` — 나중에 실제 메일 발송기로 교체 가능하도록 `PasswordResetMailer` 인터페이스 뒤에 둔다.

- [ ] **Step 1: DTO 작성**

```java
package com.mcm.passport.account.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record PasswordResetRequest(@Email @NotBlank String email) {
}
```

```java
package com.mcm.passport.account.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ConfirmPasswordResetRequest(
    @NotBlank String token,
    @NotBlank @Size(min = 8, max = 100) String newPassword
) {
}
```

- [ ] **Step 2: 이메일 발송 스텁 인터페이스 작성 (지금은 로그만 남김, 나중에 실제 SMTP/SES 구현체로 교체)**

```java
package com.mcm.passport.account;

public interface PasswordResetMailer {
    void sendResetLink(String email, String token);
}
```

```java
package com.mcm.passport.account;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class LoggingPasswordResetMailer implements PasswordResetMailer {
    @Override
    public void sendResetLink(String email, String token) {
        log.info("[비밀번호 재설정] {}에게 토큰 {} 발급 (실제 메일 발송은 아직 미구현)", email, token);
    }
}
```

- [ ] **Step 3: `AccountServiceTest`에 실패하는 테스트 추가**

```java
    @Test
    void requestPasswordResetCreatesToken() {
        AccountService service = newService();
        Account account = new Account("user@example.com", "hash", "닉네임");
        when(accountRepository.findByEmail("user@example.com")).thenReturn(java.util.Optional.of(account));

        service.requestPasswordReset("user@example.com");

        verify(passwordResetTokenRepository).save(any(PasswordResetToken.class));
        verify(passwordResetMailer).sendResetLink(eq("user@example.com"), any(String.class));
    }

    @Test
    void confirmPasswordResetRejectsExpiredToken() {
        AccountService service = newService();
        PasswordResetToken expired = new PasswordResetToken(1L, "expired-token",
            java.time.LocalDateTime.now().minusMinutes(1));
        when(passwordResetTokenRepository.findByToken("expired-token"))
            .thenReturn(java.util.Optional.of(expired));

        assertThatThrownBy(() -> service.confirmPasswordReset(
                new ConfirmPasswordResetRequest("expired-token", "newpassword123")))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.RESET_TOKEN_INVALID);
    }

    private AccountService newService() {
        return new AccountService(accountRepository, passwordResetTokenRepository,
            passwordEncoder, jwtTokenProvider(), passwordResetMailer);
    }
```

**주의:** 이 시점부터 `AccountService` 생성자에 `PasswordResetTokenRepository`, `PasswordResetMailer`가 추가되므로, 이전 테스트들(`signupCreatesAccountWithHashedPassword` 등)의 `new AccountService(...)` 호출부도 전부 `newService()` 헬퍼로 교체해야 컴파일이 된다. 또한 클래스 상단에 `@Mock private PasswordResetTokenRepository passwordResetTokenRepository;`, `@Mock private PasswordResetMailer passwordResetMailer;` 필드를 추가한다.

- [ ] **Step 4: 테스트 실행해서 실패 확인**

Run: `./gradlew test --tests "com.mcm.passport.account.AccountServiceTest"`
Expected: FAIL — 생성자 시그니처 불일치로 컴파일 에러

- [ ] **Step 5: `AccountService`에 메서드 및 생성자 파라미터 추가**

```java
package com.mcm.passport.account;

import com.mcm.passport.account.dto.*;
import com.mcm.passport.common.exception.ApiException;
import com.mcm.passport.common.exception.ErrorCode;
import com.mcm.passport.common.security.JwtTokenProvider;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional
public class AccountService {

    private final AccountRepository accountRepository;
    private final PasswordResetTokenRepository passwordResetTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;
    private final PasswordResetMailer passwordResetMailer;

    public AccountResponse signup(SignupRequest request) {
        if (accountRepository.existsByEmail(request.email())) {
            throw new ApiException(ErrorCode.EMAIL_ALREADY_EXISTS);
        }
        Account account = new Account(
            request.email(), passwordEncoder.encode(request.password()), request.nickname());
        return AccountResponse.from(accountRepository.save(account));
    }

    public LoginResponse login(LoginRequest request) {
        Account account = accountRepository.findByEmail(request.email())
            .filter(Account::isActive)
            .orElseThrow(() -> new ApiException(ErrorCode.INVALID_CREDENTIALS));
        if (!passwordEncoder.matches(request.password(), account.getPasswordHash())) {
            throw new ApiException(ErrorCode.INVALID_CREDENTIALS);
        }
        return new LoginResponse(jwtTokenProvider.generateToken(account.getId()), AccountResponse.from(account));
    }

    public AccountResponse getMe(Long accountId) {
        return AccountResponse.from(getActiveAccountOrThrow(accountId));
    }

    public AccountResponse updateProfile(Long accountId, UpdateProfileRequest request) {
        Account account = getActiveAccountOrThrow(accountId);
        account.changeNickname(request.nickname());
        return AccountResponse.from(account);
    }

    public void requestPasswordReset(String email) {
        accountRepository.findByEmail(email).ifPresent(account -> {
            String token = UUID.randomUUID().toString();
            passwordResetTokenRepository.save(
                new PasswordResetToken(account.getId(), token, LocalDateTime.now().plusMinutes(30)));
            passwordResetMailer.sendResetLink(email, token);
        });
        // 존재하지 않는 이메일이어도 에러를 던지지 않는다 (계정 존재 여부 노출 방지)
    }

    public void confirmPasswordReset(ConfirmPasswordResetRequest request) {
        PasswordResetToken resetToken = passwordResetTokenRepository.findByToken(request.token())
            .filter(t -> t.isUsable(LocalDateTime.now()))
            .orElseThrow(() -> new ApiException(ErrorCode.RESET_TOKEN_INVALID));
        Account account = accountRepository.findById(resetToken.getAccountId())
            .orElseThrow(() -> new ApiException(ErrorCode.ACCOUNT_NOT_FOUND));
        account.changePassword(passwordEncoder.encode(request.newPassword()));
        resetToken.markUsed();
    }

    private Account getActiveAccountOrThrow(Long accountId) {
        return accountRepository.findById(accountId)
            .orElseThrow(() -> new ApiException(ErrorCode.ACCOUNT_NOT_FOUND));
    }
}
```

- [ ] **Step 6: `Account`에 `changePassword` 메서드 추가**

```java
    public void changePassword(String newPasswordHash) {
        this.passwordHash = newPasswordHash;
    }
```
(`Account.java`의 `withdraw()` 메서드 아래에 추가)

- [ ] **Step 7: 테스트 재실행해서 통과 확인**

Run: `./gradlew test --tests "com.mcm.passport.account.AccountServiceTest"`
Expected: PASS

- [ ] **Step 8: 컨트롤러에 엔드포인트 추가**

```java
    @PostMapping("/auth/password-reset")
    public ResponseEntity<Void> requestPasswordReset(@Valid @RequestBody PasswordResetRequest request) {
        accountService.requestPasswordReset(request.email());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/auth/password-reset/confirm")
    public ResponseEntity<Void> confirmPasswordReset(@Valid @RequestBody ConfirmPasswordResetRequest request) {
        accountService.confirmPasswordReset(request);
        return ResponseEntity.noContent().build();
    }
```

- [ ] **Step 9: 컴파일 확인 후 커밋**

Run: `./gradlew compileJava compileTestJava`
Expected: BUILD SUCCESSFUL

```bash
git add src/main/java/com/mcm/passport/account/ src/test/java/com/mcm/passport/account/AccountServiceTest.java
git commit -m "feat: add password reset flow"
```

---

## Task 9: 회원 탈퇴 (DELETE /api/account/me) — 계정 단독 처리

**Files:**
- Modify: `src/main/java/com/mcm/passport/account/AccountService.java` (`withdraw` 추가)
- Modify: `src/main/java/com/mcm/passport/account/AccountController.java` (엔드포인트 추가)
- Test: `src/test/java/com/mcm/passport/account/AccountServiceTest.java` (테스트 추가)

**Interfaces:**
- Produces: `AccountService.withdraw(Long accountId): void`. **주의:** 이 태스크에서는 계정만 `WITHDRAWN` 처리하고, 소유 Passport를 `DELETED`로 연쇄 처리하는 로직은 아직 없다 — Task 16에서 Passport 도메인이 만들어진 뒤에 이어서 구현한다 (지금은 Passport 엔티티 자체가 없어서 참조 불가능).

- [ ] **Step 1: 실패하는 테스트 추가**

```java
    @Test
    void withdrawSetsAccountStatusToWithdrawn() {
        AccountService service = newService();
        Account account = new Account("user@example.com", "hash", "닉네임");
        when(accountRepository.findById(1L)).thenReturn(java.util.Optional.of(account));

        service.withdraw(1L);

        assertThat(account.getStatus()).isEqualTo(AccountStatus.WITHDRAWN);
        assertThat(account.getWithdrawnAt()).isNotNull();
    }
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `./gradlew test --tests "com.mcm.passport.account.AccountServiceTest"`
Expected: FAIL — `withdraw` 메서드 없음

- [ ] **Step 3: `AccountService`에 `withdraw` 추가**

```java
    public void withdraw(Long accountId) {
        Account account = getActiveAccountOrThrow(accountId);
        account.withdraw();
    }
```
(`confirmPasswordReset` 메서드 아래에 추가)

- [ ] **Step 4: 테스트 재실행해서 통과 확인**

Run: `./gradlew test --tests "com.mcm.passport.account.AccountServiceTest"`
Expected: PASS

- [ ] **Step 5: 컨트롤러에 엔드포인트 추가**

```java
    @DeleteMapping("/account/me")
    public ResponseEntity<Void> withdraw(Authentication authentication) {
        accountService.withdraw(CurrentAccount.id(authentication));
        return ResponseEntity.noContent().build();
    }
```

- [ ] **Step 6: 컴파일 확인 후 커밋**

Run: `./gradlew compileJava compileTestJava`
Expected: BUILD SUCCESSFUL

```bash
git add src/main/java/com/mcm/passport/account/ src/test/java/com/mcm/passport/account/AccountServiceTest.java
git commit -m "feat: add account withdrawal (soft delete)"
```

---

## Task 10: Passport 스키마 + 엔티티 + 리포지토리 (부분 유니크 인덱스 포함)

**Files:**
- Create: `src/main/resources/db/migration/V2__create_passport_table.sql`
- Create: `src/main/java/com/mcm/passport/passport/PassportStatus.java`
- Create: `src/main/java/com/mcm/passport/passport/UsageFrequency.java`
- Create: `src/main/java/com/mcm/passport/passport/Passport.java`
- Create: `src/main/java/com/mcm/passport/passport/PassportRepository.java`
- Test: `src/test/java/com/mcm/passport/passport/PassportRepositoryTest.java`

**Interfaces:**
- Produces: `Passport(String serialNumber, int purchaseYear, Long ownerAccountId, String modelName, String nickname, LocalDate purchaseDate, String purchasePlace, String receiptImageUrl, boolean hasReceiptTag, List<String> baselineImageUrls, UsageFrequency usageFrequency)` 생성자. `PassportRepository.existsBySerialNumberAndPurchaseYearAndStatus(String, int, PassportStatus): boolean` — 이게 스펙의 핵심 유니크 규칙(활성 상태에서만 중복 판정)을 애플리케이션 레벨에서도 미리 걸러주는 역할, DB의 부분 유니크 인덱스가 최종 안전망.

- [ ] **Step 1: Flyway 마이그레이션 작성 (부분 유니크 인덱스 포함)**

```sql
-- V2__create_passport_table.sql
CREATE TABLE passport (
    id BIGSERIAL PRIMARY KEY,
    serial_number VARCHAR(20) NOT NULL,
    purchase_year INT NOT NULL,
    owner_account_id BIGINT NOT NULL REFERENCES account(id),
    model_name VARCHAR(100) NOT NULL,
    nickname VARCHAR(100),
    purchase_date DATE NOT NULL,
    purchase_place VARCHAR(200),
    receipt_image_url VARCHAR(500),
    has_receipt_tag BOOLEAN NOT NULL DEFAULT false,
    baseline_image_urls TEXT[] NOT NULL DEFAULT '{}',
    usage_frequency VARCHAR(30) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_passport_serial_year_active
    ON passport (serial_number, purchase_year)
    WHERE status = 'ACTIVE';
```

- [ ] **Step 2: enum 작성**

```java
package com.mcm.passport.passport;

public enum PassportStatus {
    ACTIVE, DELETED
}
```

```java
package com.mcm.passport.passport;

public enum UsageFrequency {
    DAILY, FEW_TIMES_A_WEEK, OCCASIONAL, RARE
}
```

- [ ] **Step 3: `Passport` 엔티티 작성**

```java
package com.mcm.passport.passport;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Entity
@Table(name = "passport")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Passport {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "serial_number", nullable = false)
    private String serialNumber;

    @Column(name = "purchase_year", nullable = false)
    private int purchaseYear;

    @Column(name = "owner_account_id", nullable = false)
    private Long ownerAccountId;

    @Column(name = "model_name", nullable = false)
    private String modelName;

    private String nickname;

    @Column(name = "purchase_date", nullable = false)
    private LocalDate purchaseDate;

    @Column(name = "purchase_place")
    private String purchasePlace;

    @Column(name = "receipt_image_url")
    private String receiptImageUrl;

    @Column(name = "has_receipt_tag", nullable = false)
    private boolean hasReceiptTag;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "baseline_image_urls", columnDefinition = "text[]", nullable = false)
    private List<String> baselineImageUrls;

    @Enumerated(EnumType.STRING)
    @Column(name = "usage_frequency", nullable = false)
    private UsageFrequency usageFrequency;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PassportStatus status;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public Passport(String serialNumber, int purchaseYear, Long ownerAccountId, String modelName,
                     String nickname, LocalDate purchaseDate, String purchasePlace,
                     String receiptImageUrl, boolean hasReceiptTag,
                     List<String> baselineImageUrls, UsageFrequency usageFrequency) {
        this.serialNumber = serialNumber;
        this.purchaseYear = purchaseYear;
        this.ownerAccountId = ownerAccountId;
        this.modelName = modelName;
        this.nickname = nickname;
        this.purchaseDate = purchaseDate;
        this.purchasePlace = purchasePlace;
        this.receiptImageUrl = receiptImageUrl;
        this.hasReceiptTag = hasReceiptTag;
        this.baselineImageUrls = baselineImageUrls;
        this.usageFrequency = usageFrequency;
        this.status = PassportStatus.ACTIVE;
    }

    @PrePersist
    void prePersist() {
        this.createdAt = LocalDateTime.now();
    }

    public void updateProfile(String nickname, UsageFrequency usageFrequency) {
        if (nickname != null) this.nickname = nickname;
        if (usageFrequency != null) this.usageFrequency = usageFrequency;
    }

    public void softDelete() {
        this.status = PassportStatus.DELETED;
    }

    public boolean isOwnedBy(Long accountId) {
        return this.ownerAccountId.equals(accountId);
    }
}
```

- [ ] **Step 4: 리포지토리 작성**

```java
package com.mcm.passport.passport;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PassportRepository extends JpaRepository<Passport, Long> {
    boolean existsBySerialNumberAndPurchaseYearAndStatus(
        String serialNumber, int purchaseYear, PassportStatus status);

    Page<Passport> findAllByOwnerAccountIdAndStatus(
        Long ownerAccountId, PassportStatus status, Pageable pageable);

    Optional<Passport> findByIdAndStatus(Long id, PassportStatus status);

    List<Passport> findAllByOwnerAccountId(Long ownerAccountId);

    List<Passport> findAllByStatus(PassportStatus status);
}
```

- [ ] **Step 5: 통합 테스트 작성 (부분 유니크 인덱스 검증이 핵심)**

```java
package com.mcm.passport.passport;

import com.mcm.passport.account.Account;
import com.mcm.passport.account.AccountRepository;
import com.mcm.passport.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PassportRepositoryTest extends AbstractIntegrationTest {

    @Autowired
    private PassportRepository passportRepository;
    @Autowired
    private AccountRepository accountRepository;

    @Test
    void duplicateActiveSerialAndYearIsRejectedByDbConstraint() {
        Account owner = accountRepository.save(new Account("a@example.com", "hash", "닉네임"));
        passportRepository.saveAndFlush(newPassport(owner.getId(), "A1234", 2024));

        assertThatThrownBy(() ->
            passportRepository.saveAndFlush(newPassport(owner.getId(), "A1234", 2024)))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void sameSerialAndYearAllowedAfterSoftDelete() {
        Account owner = accountRepository.save(new Account("b@example.com", "hash", "닉네임"));
        Passport first = passportRepository.saveAndFlush(newPassport(owner.getId(), "B1111", 2020));
        first.softDelete();
        passportRepository.saveAndFlush(first);

        Passport second = passportRepository.saveAndFlush(newPassport(owner.getId(), "B1111", 2020));

        assertThat(second.getId()).isNotEqualTo(first.getId());
    }

    @Test
    void existsBySerialAndYearAndStatusDetectsActiveDuplicate() {
        Account owner = accountRepository.save(new Account("c@example.com", "hash", "닉네임"));
        passportRepository.save(newPassport(owner.getId(), "C2222", 2021));

        assertThat(passportRepository.existsBySerialNumberAndPurchaseYearAndStatus(
            "C2222", 2021, PassportStatus.ACTIVE)).isTrue();
    }

    private Passport newPassport(Long ownerId, String serial, int year) {
        return new Passport(serial, year, ownerId, "Nomad Backpack", "애칭",
            LocalDate.of(year, 1, 15), "MCM 강남점", null, false,
            List.of(), UsageFrequency.OCCASIONAL);
    }
}
```

- [ ] **Step 6: 테스트 실행 (Docker 필요)**

Run: `./gradlew test --tests "com.mcm.passport.passport.PassportRepositoryTest"`
Expected: PASS — 특히 `duplicateActiveSerialAndYearIsRejectedByDbConstraint`가 부분 유니크 인덱스 동작을 실제 PostgreSQL로 검증

- [ ] **Step 7: 커밋**

```bash
git add src/main/resources/db/migration/V2__create_passport_table.sql src/main/java/com/mcm/passport/passport/PassportStatus.java src/main/java/com/mcm/passport/passport/UsageFrequency.java src/main/java/com/mcm/passport/passport/Passport.java src/main/java/com/mcm/passport/passport/PassportRepository.java src/test/java/com/mcm/passport/passport/PassportRepositoryTest.java
git commit -m "feat: add Passport entity with partial unique index on (serial, year)"
```

---

## Task 11: 시리얼 번호 검증기

**Files:**
- Create: `src/main/java/com/mcm/passport/passport/SerialValidator.java`
- Test: `src/test/java/com/mcm/passport/passport/SerialValidatorTest.java`

**Interfaces:**
- Produces: `SerialValidator.isValid(String serialNumber): boolean` — 신형(`영문자1+숫자4`)과 빈티지(`숫자4`) 포맷 중 하나라도 맞으면 true.

- [ ] **Step 1: 실패하는 테스트 작성**

```java
package com.mcm.passport.passport;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SerialValidatorTest {

    @Test
    void acceptsNewFormat() {
        assertThat(SerialValidator.isValid("A1234")).isTrue();
        assertThat(SerialValidator.isValid("z9999")).isTrue();
    }

    @Test
    void acceptsVintageFormat() {
        assertThat(SerialValidator.isValid("1234")).isTrue();
        assertThat(SerialValidator.isValid("0007")).isTrue();
    }

    @Test
    void rejectsInvalidFormats() {
        assertThat(SerialValidator.isValid("AB123")).isFalse();
        assertThat(SerialValidator.isValid("12345")).isFalse();
        assertThat(SerialValidator.isValid("A123")).isFalse();
        assertThat(SerialValidator.isValid("")).isFalse();
        assertThat(SerialValidator.isValid(null)).isFalse();
    }
}
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `./gradlew test --tests "com.mcm.passport.passport.SerialValidatorTest"`
Expected: FAIL — `SerialValidator` 클래스 없음

- [ ] **Step 3: 구현**

```java
package com.mcm.passport.passport;

import java.util.regex.Pattern;

public final class SerialValidator {

    private static final Pattern NEW_FORMAT = Pattern.compile("^[A-Za-z]\\d{4}$");
    private static final Pattern VINTAGE_FORMAT = Pattern.compile("^\\d{4}$");

    private SerialValidator() {
    }

    public static boolean isValid(String serialNumber) {
        if (serialNumber == null) {
            return false;
        }
        return NEW_FORMAT.matcher(serialNumber).matches()
            || VINTAGE_FORMAT.matcher(serialNumber).matches();
    }
}
```

- [ ] **Step 4: 테스트 재실행해서 통과 확인**

Run: `./gradlew test --tests "com.mcm.passport.passport.SerialValidatorTest"`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/main/java/com/mcm/passport/passport/SerialValidator.java src/test/java/com/mcm/passport/passport/SerialValidatorTest.java
git commit -m "feat: add serial number format validator"
```

---

## Task 12: 이미지 저장소 추상화 (Cloudinary)

**Files:**
- Create: `src/main/java/com/mcm/passport/common/storage/ImageStorageService.java`
- Create: `src/main/java/com/mcm/passport/common/storage/CloudinaryImageStorageService.java`
- Create: `src/main/java/com/mcm/passport/common/config/CloudinaryConfig.java`
- Modify: `src/main/java/com/mcm/passport/common/exception/ErrorCode.java` (`IMAGE_UPLOAD_FAILED` 이미 존재 — 변경 없음)
- Test: `src/test/java/com/mcm/passport/common/storage/CloudinaryImageStorageServiceTest.java`

**Interfaces:**
- Produces: `ImageStorageService.upload(MultipartFile file): String` (Cloudinary secure_url 반환, 실패 시 `ApiException(IMAGE_UPLOAD_FAILED)`) — 이후 Passport 등록, 진단 사진 업로드 등 모든 이미지 업로드가 이 인터페이스만 의존한다.

- [ ] **Step 1: 인터페이스 작성**

```java
package com.mcm.passport.common.storage;

import org.springframework.web.multipart.MultipartFile;

public interface ImageStorageService {
    String upload(MultipartFile file);
}
```

- [ ] **Step 2: 실패하는 테스트 작성 (Mockito로 Cloudinary SDK를 모킹, 네트워크 호출 없음)**

```java
package com.mcm.passport.common.storage;

import com.cloudinary.Cloudinary;
import com.cloudinary.Uploader;
import com.mcm.passport.common.exception.ApiException;
import com.mcm.passport.common.exception.ErrorCode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CloudinaryImageStorageServiceTest {

    @Mock
    private Cloudinary cloudinary;
    @Mock
    private Uploader uploader;

    @Test
    void uploadReturnsSecureUrl() throws IOException {
        when(cloudinary.uploader()).thenReturn(uploader);
        when(uploader.upload(any(byte[].class), anyMap()))
            .thenReturn(Map.of("secure_url", "https://res.cloudinary.com/demo/image/upload/sample.jpg"));
        CloudinaryImageStorageService service = new CloudinaryImageStorageService(cloudinary);
        MultipartFile file = new MockMultipartFile("file", "a.jpg", "image/jpeg", "data".getBytes());

        String url = service.upload(file);

        assertThat(url).isEqualTo("https://res.cloudinary.com/demo/image/upload/sample.jpg");
    }

    @Test
    void uploadFailureThrowsImageUploadFailed() throws IOException {
        when(cloudinary.uploader()).thenReturn(uploader);
        when(uploader.upload(any(byte[].class), anyMap())).thenThrow(new IOException("network error"));
        CloudinaryImageStorageService service = new CloudinaryImageStorageService(cloudinary);
        MultipartFile file = new MockMultipartFile("file", "a.jpg", "image/jpeg", "data".getBytes());

        assertThatThrownBy(() -> service.upload(file))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.IMAGE_UPLOAD_FAILED);
    }
}
```

- [ ] **Step 3: 테스트 실행해서 실패 확인**

Run: `./gradlew test --tests "com.mcm.passport.common.storage.CloudinaryImageStorageServiceTest"`
Expected: FAIL — `CloudinaryImageStorageService` 클래스 없음

- [ ] **Step 4: 구현**

```java
package com.mcm.passport.common.storage;

import com.cloudinary.Cloudinary;
import com.cloudinary.utils.ObjectUtils;
import com.mcm.passport.common.exception.ApiException;
import com.mcm.passport.common.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class CloudinaryImageStorageService implements ImageStorageService {

    private final Cloudinary cloudinary;

    @Override
    public String upload(MultipartFile file) {
        try {
            Map<?, ?> result = cloudinary.uploader().upload(file.getBytes(), ObjectUtils.emptyMap());
            return (String) result.get("secure_url");
        } catch (IOException e) {
            throw new ApiException(ErrorCode.IMAGE_UPLOAD_FAILED);
        }
    }
}
```

- [ ] **Step 5: `CloudinaryConfig` 빈 등록**

```java
package com.mcm.passport.common.config;

import com.cloudinary.Cloudinary;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class CloudinaryConfig {

    @Bean
    public Cloudinary cloudinary(@Value("${cloudinary.url}") String cloudinaryUrl) {
        return new Cloudinary(cloudinaryUrl);
    }
}
```

- [ ] **Step 6: 테스트 재실행해서 통과 확인**

Run: `./gradlew test --tests "com.mcm.passport.common.storage.CloudinaryImageStorageServiceTest"`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add src/main/java/com/mcm/passport/common/storage/ src/main/java/com/mcm/passport/common/config/CloudinaryConfig.java src/test/java/com/mcm/passport/common/storage/
git commit -m "feat: add Cloudinary-backed image storage service"
```

---

## Task 13: 여권 등록 (POST /api/passports)

**Files:**
- Create: `src/main/java/com/mcm/passport/passport/dto/RegisterPassportRequest.java`
- Create: `src/main/java/com/mcm/passport/passport/dto/PassportResponse.java`
- Create: `src/main/java/com/mcm/passport/passport/PassportService.java`
- Create: `src/main/java/com/mcm/passport/passport/PassportController.java`
- Test: `src/test/java/com/mcm/passport/passport/PassportServiceTest.java`

**Interfaces:**
- Consumes: `SerialValidator.isValid` (Task 11), `ImageStorageService.upload` (Task 12), `PassportRepository` (Task 10)
- Produces: `PassportService.register(Long ownerAccountId, RegisterPassportRequest request, MultipartFile receiptImage, List<MultipartFile> baselineImages): PassportResponse`

- [ ] **Step 1: DTO 작성**

```java
package com.mcm.passport.passport.dto;

import com.mcm.passport.passport.UsageFrequency;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

public record RegisterPassportRequest(
    @NotBlank String serialNumber,
    @NotBlank String modelName,
    String nickname,
    @NotNull LocalDate purchaseDate,
    String purchasePlace,
    @NotNull UsageFrequency usageFrequency
) {
}
```

```java
package com.mcm.passport.passport.dto;

import com.mcm.passport.passport.Passport;
import com.mcm.passport.passport.PassportStatus;
import com.mcm.passport.passport.UsageFrequency;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

// receiptImageUrl은 비공개 데이터이므로 이 응답에 절대 포함하지 않는다 (스펙 10번).
public record PassportResponse(
    Long id,
    String serialNumber,
    int purchaseYear,
    String modelName,
    String nickname,
    LocalDate purchaseDate,
    String purchasePlace,
    boolean hasReceiptTag,
    List<String> baselineImageUrls,
    UsageFrequency usageFrequency,
    PassportStatus status,
    LocalDateTime createdAt
) {
    public static PassportResponse from(Passport passport) {
        return new PassportResponse(
            passport.getId(), passport.getSerialNumber(), passport.getPurchaseYear(),
            passport.getModelName(), passport.getNickname(), passport.getPurchaseDate(),
            passport.getPurchasePlace(), passport.isHasReceiptTag(), passport.getBaselineImageUrls(),
            passport.getUsageFrequency(), passport.getStatus(), passport.getCreatedAt()
        );
    }
}
```

- [ ] **Step 2: 실패하는 서비스 테스트 작성**

```java
package com.mcm.passport.passport;

import com.mcm.passport.common.exception.ApiException;
import com.mcm.passport.common.exception.ErrorCode;
import com.mcm.passport.common.storage.ImageStorageService;
import com.mcm.passport.passport.dto.PassportResponse;
import com.mcm.passport.passport.dto.RegisterPassportRequest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PassportServiceTest {

    @Mock
    private PassportRepository passportRepository;
    @Mock
    private ImageStorageService imageStorageService;

    private PassportService passportService;

    @Test
    void registerRejectsInvalidSerialFormat() {
        passportService = new PassportService(passportRepository, imageStorageService);
        RegisterPassportRequest request = new RegisterPassportRequest(
            "INVALID", "Nomad Backpack", "애칭", LocalDate.of(2024, 3, 1), "MCM 강남점",
            UsageFrequency.OCCASIONAL);

        assertThatThrownBy(() -> passportService.register(1L, request, null, List.of()))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.INVALID_SERIAL_FORMAT);
    }

    @Test
    void registerRejectsActiveDuplicate() {
        passportService = new PassportService(passportRepository, imageStorageService);
        when(passportRepository.existsBySerialNumberAndPurchaseYearAndStatus("A1234", 2024, PassportStatus.ACTIVE))
            .thenReturn(true);
        RegisterPassportRequest request = new RegisterPassportRequest(
            "A1234", "Nomad Backpack", "애칭", LocalDate.of(2024, 3, 1), "MCM 강남점",
            UsageFrequency.OCCASIONAL);

        assertThatThrownBy(() -> passportService.register(1L, request, null, List.of()))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.SERIAL_ALREADY_REGISTERED);
    }

    @Test
    void registerSucceedsWithReceiptAndBaselineImages() {
        passportService = new PassportService(passportRepository, imageStorageService);
        when(passportRepository.existsBySerialNumberAndPurchaseYearAndStatus("A1234", 2024, PassportStatus.ACTIVE))
            .thenReturn(false);
        MultipartFile receipt = new MockMultipartFile("receipt", "r.jpg", "image/jpeg", "r".getBytes());
        MultipartFile baseline1 = new MockMultipartFile("baseline", "b1.jpg", "image/jpeg", "b1".getBytes());
        when(imageStorageService.upload(receipt)).thenReturn("https://cdn/receipt.jpg");
        when(imageStorageService.upload(baseline1)).thenReturn("https://cdn/baseline1.jpg");
        when(passportRepository.save(any(Passport.class))).thenAnswer(inv -> inv.getArgument(0));
        RegisterPassportRequest request = new RegisterPassportRequest(
            "A1234", "Nomad Backpack", "애칭", LocalDate.of(2024, 3, 1), "MCM 강남점",
            UsageFrequency.OCCASIONAL);

        PassportResponse response = passportService.register(1L, request, receipt, List.of(baseline1));

        assertThat(response.hasReceiptTag()).isTrue();
        assertThat(response.baselineImageUrls()).containsExactly("https://cdn/baseline1.jpg");
        assertThat(response.purchaseYear()).isEqualTo(2024);
    }

    @Test
    void registerAllowsMissingReceipt() {
        passportService = new PassportService(passportRepository, imageStorageService);
        when(passportRepository.existsBySerialNumberAndPurchaseYearAndStatus("1234", 1998, PassportStatus.ACTIVE))
            .thenReturn(false);
        when(passportRepository.save(any(Passport.class))).thenAnswer(inv -> inv.getArgument(0));
        RegisterPassportRequest request = new RegisterPassportRequest(
            "1234", "Vintage Backpack", "빈티지", LocalDate.of(1998, 5, 1), null,
            UsageFrequency.RARE);

        PassportResponse response = passportService.register(1L, request, null, List.of());

        assertThat(response.hasReceiptTag()).isFalse();
    }
}
```

- [ ] **Step 3: 테스트 실행해서 실패 확인**

Run: `./gradlew test --tests "com.mcm.passport.passport.PassportServiceTest"`
Expected: FAIL — `PassportService` 클래스 없음

- [ ] **Step 4: `PassportService.register` 구현**

```java
package com.mcm.passport.passport;

import com.mcm.passport.common.exception.ApiException;
import com.mcm.passport.common.exception.ErrorCode;
import com.mcm.passport.common.storage.ImageStorageService;
import com.mcm.passport.passport.dto.PassportResponse;
import com.mcm.passport.passport.dto.RegisterPassportRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional
public class PassportService {

    private final PassportRepository passportRepository;
    private final ImageStorageService imageStorageService;

    public PassportResponse register(Long ownerAccountId, RegisterPassportRequest request,
                                      MultipartFile receiptImage, List<MultipartFile> baselineImages) {
        if (!SerialValidator.isValid(request.serialNumber())) {
            throw new ApiException(ErrorCode.INVALID_SERIAL_FORMAT);
        }
        int purchaseYear = request.purchaseDate().getYear();
        if (passportRepository.existsBySerialNumberAndPurchaseYearAndStatus(
                request.serialNumber(), purchaseYear, PassportStatus.ACTIVE)) {
            throw new ApiException(ErrorCode.SERIAL_ALREADY_REGISTERED);
        }

        String receiptImageUrl = receiptImage != null && !receiptImage.isEmpty()
            ? imageStorageService.upload(receiptImage) : null;
        List<String> baselineImageUrls = baselineImages.stream()
            .map(imageStorageService::upload)
            .toList();

        Passport passport = new Passport(
            request.serialNumber(), purchaseYear, ownerAccountId, request.modelName(),
            request.nickname(), request.purchaseDate(), request.purchasePlace(),
            receiptImageUrl, receiptImageUrl != null, baselineImageUrls, request.usageFrequency());

        try {
            return PassportResponse.from(passportRepository.save(passport));
        } catch (DataIntegrityViolationException e) {
            // 사전 존재여부 체크와 실제 저장 사이의 경합 상태를 대비한 DB 레벨 안전망
            throw new ApiException(ErrorCode.SERIAL_ALREADY_REGISTERED);
        }
    }
}
```

- [ ] **Step 5: 테스트 재실행해서 통과 확인**

Run: `./gradlew test --tests "com.mcm.passport.passport.PassportServiceTest"`
Expected: PASS

- [ ] **Step 6: 컨트롤러 작성**

```java
package com.mcm.passport.passport;

import com.mcm.passport.common.security.CurrentAccount;
import com.mcm.passport.passport.dto.PassportResponse;
import com.mcm.passport.passport.dto.RegisterPassportRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/api/passports")
@RequiredArgsConstructor
public class PassportController {

    private final PassportService passportService;

    @PostMapping(consumes = "multipart/form-data")
    public ResponseEntity<PassportResponse> register(
            Authentication authentication,
            @RequestPart("request") RegisterPassportRequest request,
            @RequestPart(value = "receiptImage", required = false) MultipartFile receiptImage,
            @RequestPart(value = "baselineImages", required = false) List<MultipartFile> baselineImages) {
        List<MultipartFile> images = baselineImages != null ? baselineImages : List.of();
        PassportResponse response = passportService.register(
            CurrentAccount.id(authentication), request, receiptImage, images);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }
}
```

- [ ] **Step 7: 컴파일 확인 후 커밋**

Run: `./gradlew compileJava compileTestJava`
Expected: BUILD SUCCESSFUL

```bash
git add src/main/java/com/mcm/passport/passport/ src/test/java/com/mcm/passport/passport/PassportServiceTest.java
git commit -m "feat: add passport registration endpoint"
```

---

## Task 14: 여권 목록/상세 조회 (GET /api/passports, GET /api/passports/{id})

**Files:**
- Create: `src/main/java/com/mcm/passport/passport/dto/PassportSummaryResponse.java`
- Modify: `src/main/java/com/mcm/passport/passport/PassportService.java` (`list`, `getDetail` 추가)
- Modify: `src/main/java/com/mcm/passport/passport/PassportController.java` (엔드포인트 추가)
- Test: `src/test/java/com/mcm/passport/passport/PassportServiceTest.java` (테스트 추가)

**Interfaces:**
- Produces: `PassportService.list(Long ownerAccountId, Pageable pageable): Page<PassportSummaryResponse>`, `PassportService.getDetail(Long passportId, Long requesterAccountId): PassportResponse`.
- **참고:** `PassportSummaryResponse`의 `overallGrade`, `lastDiagnosedAt` 필드는 지금은 항상 `null`로 채워진다 — Diagnosis 도메인이 아직 없기 때문. Task 21에서 Diagnosis 도메인이 만들어진 뒤 이 값을 실제로 채우도록 되돌아온다.

- [ ] **Step 1: `PassportSummaryResponse` 작성 (진단 관련 필드는 nullable로 미리 확보)**

```java
package com.mcm.passport.passport.dto;

import com.mcm.passport.passport.Passport;

import java.time.LocalDate;
import java.time.LocalDateTime;

public record PassportSummaryResponse(
    Long id,
    String modelName,
    String nickname,
    long ownershipDays,
    String overallGrade,        // Task 21에서 채워짐, 그 전까지는 null
    LocalDateTime lastDiagnosedAt // Task 21에서 채워짐, 그 전까지는 null
) {
    public static PassportSummaryResponse withoutDiagnosis(Passport passport) {
        long ownershipDays = java.time.temporal.ChronoUnit.DAYS.between(
            passport.getPurchaseDate(), LocalDate.now());
        return new PassportSummaryResponse(
            passport.getId(), passport.getModelName(), passport.getNickname(),
            ownershipDays, null, null);
    }
}
```

- [ ] **Step 2: 실패하는 테스트 추가**

```java
    @Test
    void listReturnsOnlyOwnersActivePassports() {
        passportService = new PassportService(passportRepository, imageStorageService);
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.OCCASIONAL);
        org.springframework.data.domain.Pageable pageable = org.springframework.data.domain.PageRequest.of(0, 20);
        when(passportRepository.findAllByOwnerAccountIdAndStatus(1L, PassportStatus.ACTIVE, pageable))
            .thenReturn(new org.springframework.data.domain.PageImpl<>(List.of(passport)));

        var page = passportService.list(1L, pageable);

        assertThat(page.getContent()).hasSize(1);
        assertThat(page.getContent().get(0).modelName()).isEqualTo("Nomad Backpack");
    }

    @Test
    void getDetailRejectsNonOwner() {
        passportService = new PassportService(passportRepository, imageStorageService);
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.OCCASIONAL);
        when(passportRepository.findByIdAndStatus(10L, PassportStatus.ACTIVE))
            .thenReturn(java.util.Optional.of(passport));

        assertThatThrownBy(() -> passportService.getDetail(10L, 999L))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.FORBIDDEN);
    }

    @Test
    void getDetailThrowsNotFoundWhenMissing() {
        passportService = new PassportService(passportRepository, imageStorageService);
        when(passportRepository.findByIdAndStatus(99L, PassportStatus.ACTIVE))
            .thenReturn(java.util.Optional.empty());

        assertThatThrownBy(() -> passportService.getDetail(99L, 1L))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.PASSPORT_NOT_FOUND);
    }
```

- [ ] **Step 3: 테스트 실행해서 실패 확인**

Run: `./gradlew test --tests "com.mcm.passport.passport.PassportServiceTest"`
Expected: FAIL — `list`, `getDetail` 메서드 없음

- [ ] **Step 4: `PassportService`에 메서드 추가**

```java
    public org.springframework.data.domain.Page<PassportSummaryResponse> list(
            Long ownerAccountId, org.springframework.data.domain.Pageable pageable) {
        return passportRepository.findAllByOwnerAccountIdAndStatus(ownerAccountId, PassportStatus.ACTIVE, pageable)
            .map(PassportSummaryResponse::withoutDiagnosis);
    }

    public PassportResponse getDetail(Long passportId, Long requesterAccountId) {
        Passport passport = getOwnedActivePassport(passportId, requesterAccountId);
        return PassportResponse.from(passport);
    }

    private Passport getOwnedActivePassport(Long passportId, Long requesterAccountId) {
        Passport passport = passportRepository.findByIdAndStatus(passportId, PassportStatus.ACTIVE)
            .orElseThrow(() -> new ApiException(ErrorCode.PASSPORT_NOT_FOUND));
        if (!passport.isOwnedBy(requesterAccountId)) {
            throw new ApiException(ErrorCode.FORBIDDEN);
        }
        return passport;
    }
```
(클래스 상단 import에 `com.mcm.passport.passport.dto.PassportSummaryResponse` 추가. `getOwnedActivePassport`는 Task 15에서도 재사용한다.)

- [ ] **Step 5: 테스트 재실행해서 통과 확인**

Run: `./gradlew test --tests "com.mcm.passport.passport.PassportServiceTest"`
Expected: PASS

- [ ] **Step 6: 컨트롤러에 엔드포인트 추가**

```java
    @GetMapping
    public ResponseEntity<org.springframework.data.domain.Page<com.mcm.passport.passport.dto.PassportSummaryResponse>> list(
            Authentication authentication,
            @org.springframework.data.web.PageableDefault(size = 20) org.springframework.data.domain.Pageable pageable) {
        return ResponseEntity.ok(passportService.list(CurrentAccount.id(authentication), pageable));
    }

    @GetMapping("/{id}")
    public ResponseEntity<PassportResponse> getDetail(Authentication authentication, @PathVariable Long id) {
        return ResponseEntity.ok(passportService.getDetail(id, CurrentAccount.id(authentication)));
    }
```

- [ ] **Step 7: 컴파일 확인 후 커밋**

Run: `./gradlew compileJava compileTestJava`
Expected: BUILD SUCCESSFUL

```bash
git add src/main/java/com/mcm/passport/passport/ src/test/java/com/mcm/passport/passport/PassportServiceTest.java
git commit -m "feat: add passport list and detail endpoints"
```

---

## Task 15: 여권 수정/삭제 (PATCH, DELETE /api/passports/{id})

**Files:**
- Create: `src/main/java/com/mcm/passport/passport/dto/UpdatePassportRequest.java`
- Modify: `src/main/java/com/mcm/passport/passport/PassportService.java` (`update`, `delete` 추가)
- Modify: `src/main/java/com/mcm/passport/passport/PassportController.java` (엔드포인트 추가)
- Test: `src/test/java/com/mcm/passport/passport/PassportServiceTest.java` (테스트 추가)
- Test: `src/test/java/com/mcm/passport/passport/PassportControllerIntegrationTest.java`

**Interfaces:**
- Produces: `PassportService.update(Long passportId, Long requesterAccountId, UpdatePassportRequest): PassportResponse`, `PassportService.delete(Long passportId, Long requesterAccountId): void`

- [ ] **Step 1: DTO 작성**

```java
package com.mcm.passport.passport.dto;

import com.mcm.passport.passport.UsageFrequency;

public record UpdatePassportRequest(String nickname, UsageFrequency usageFrequency) {
}
```

- [ ] **Step 2: 실패하는 테스트 추가**

```java
    @Test
    void updateChangesNicknameAndUsageFrequency() {
        passportService = new PassportService(passportRepository, imageStorageService);
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "이전애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.RARE);
        when(passportRepository.findByIdAndStatus(1L, PassportStatus.ACTIVE))
            .thenReturn(java.util.Optional.of(passport));

        PassportResponse response = passportService.update(1L, 1L,
            new UpdatePassportRequest("새애칭", UsageFrequency.DAILY));

        assertThat(response.nickname()).isEqualTo("새애칭");
        assertThat(response.usageFrequency()).isEqualTo(UsageFrequency.DAILY);
    }

    @Test
    void deleteSoftDeletesPassport() {
        passportService = new PassportService(passportRepository, imageStorageService);
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.RARE);
        when(passportRepository.findByIdAndStatus(1L, PassportStatus.ACTIVE))
            .thenReturn(java.util.Optional.of(passport));

        passportService.delete(1L, 1L);

        assertThat(passport.getStatus()).isEqualTo(PassportStatus.DELETED);
    }
```

- [ ] **Step 3: 테스트 실행해서 실패 확인**

Run: `./gradlew test --tests "com.mcm.passport.passport.PassportServiceTest"`
Expected: FAIL — `update`, `delete` 메서드 없음

- [ ] **Step 4: `PassportService`에 메서드 추가**

```java
    public PassportResponse update(Long passportId, Long requesterAccountId, UpdatePassportRequest request) {
        Passport passport = getOwnedActivePassport(passportId, requesterAccountId);
        passport.updateProfile(request.nickname(), request.usageFrequency());
        return PassportResponse.from(passport);
    }

    public void delete(Long passportId, Long requesterAccountId) {
        Passport passport = getOwnedActivePassport(passportId, requesterAccountId);
        passport.softDelete();
    }
```
(import에 `com.mcm.passport.passport.dto.UpdatePassportRequest` 추가)

- [ ] **Step 5: 테스트 재실행해서 통과 확인**

Run: `./gradlew test --tests "com.mcm.passport.passport.PassportServiceTest"`
Expected: PASS

- [ ] **Step 6: 컨트롤러에 엔드포인트 추가**

```java
    @PatchMapping("/{id}")
    public ResponseEntity<PassportResponse> update(
            Authentication authentication, @PathVariable Long id,
            @RequestBody com.mcm.passport.passport.dto.UpdatePassportRequest request) {
        return ResponseEntity.ok(passportService.update(id, CurrentAccount.id(authentication), request));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(Authentication authentication, @PathVariable Long id) {
        passportService.delete(id, CurrentAccount.id(authentication));
        return ResponseEntity.noContent().build();
    }
```

- [ ] **Step 7: 재등록 허용 시나리오를 검증하는 통합 테스트 작성 (핵심 회귀 방지 포인트)**

```java
package com.mcm.passport.passport;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mcm.passport.account.Account;
import com.mcm.passport.account.AccountRepository;
import com.mcm.passport.common.security.JwtTokenProvider;
import com.mcm.passport.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class PassportControllerIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private AccountRepository accountRepository;
    @Autowired
    private PasswordEncoder passwordEncoder;
    @Autowired
    private JwtTokenProvider jwtTokenProvider;
    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void reRegistrationAllowedAfterSoftDelete() throws Exception {
        Account owner = accountRepository.save(
            new Account("owner@example.com", passwordEncoder.encode("password123"), "닉네임"));
        String token = jwtTokenProvider.generateToken(owner.getId());
        byte[] requestJson = ("{\"serialNumber\":\"D5555\",\"modelName\":\"Nomad Backpack\","
            + "\"purchaseDate\":\"2023-06-01\",\"usageFrequency\":\"DAILY\"}").getBytes();

        String firstResponse = mockMvc.perform(multipart("/api/passports")
                .file(new MockMultipartFile("request", "", "application/json", requestJson))
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        long passportId = objectMapper.readTree(firstResponse).get("id").asLong();

        mockMvc.perform(delete("/api/passports/" + passportId).header("Authorization", "Bearer " + token))
            .andExpect(status().isNoContent());

        mockMvc.perform(multipart("/api/passports")
                .file(new MockMultipartFile("request", "", "application/json", requestJson))
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isCreated());
    }
}
```

`MockMultipartFile`의 세 번째 생성자 인자로 `"application/json"` content-type을 직접 지정하므로, 이 파트를 받는 `@RequestPart("request") RegisterPassportRequest request`가 Jackson으로 정상 역직렬화된다 (Task 30의 엔드투엔드 테스트에서도 동일한 패턴을 쓴다).

- [ ] **Step 8: 테스트 실행 (Docker 필요)**

Run: `./gradlew test --tests "com.mcm.passport.passport.PassportControllerIntegrationTest"`
Expected: PASS

- [ ] **Step 9: 커밋**

```bash
git add src/main/java/com/mcm/passport/passport/ src/test/java/com/mcm/passport/passport/
git commit -m "feat: add passport update and soft-delete endpoints"
```

---

## Task 16: 회원 탈퇴 → 여권 소프트삭제 연쇄 처리 연결

**Files:**
- Modify: `src/main/java/com/mcm/passport/account/AccountService.java` (`withdraw`가 Passport도 처리하도록 수정)
- Test: `src/test/java/com/mcm/passport/account/AccountServiceTest.java` (테스트 추가)

**Interfaces:**
- Consumes: `PassportRepository.findAllByOwnerAccountId(Long)` (Task 10), `Passport.softDelete()` (Task 10)

- [ ] **Step 1: `PassportRepository` 목 필드 추가, `newService()` 헬퍼 갱신, 실패하는 테스트 추가**

테스트 클래스 상단 필드 목록에 추가:

```java
    @Mock
    private com.mcm.passport.passport.PassportRepository passportRepository;
```

`newService()` 헬퍼 메서드를 다음과 같이 수정한다 (기존 5-인자 호출에 `passportRepository`를 마지막 인자로 추가):

```java
    private AccountService newService() {
        return new AccountService(accountRepository, passwordResetTokenRepository,
            passwordEncoder, jwtTokenProvider(), passwordResetMailer, passportRepository);
    }
```

이 헬퍼를 쓰는 기존 테스트들(`getMeReturnsAccount`, `updateProfileChangesNickname`, `requestPasswordResetCreatesToken`, `confirmPasswordResetRejectsExpiredToken`, `withdrawSetsAccountStatusToWithdrawn`)은 코드 수정 없이 그대로 컴파일된다. 이어서 새 테스트를 추가한다:

```java
    @Test
    void withdrawCascadesToOwnedPassports() {
        AccountService service = newService();
        Account account = new Account("user@example.com", "hash", "닉네임");
        when(accountRepository.findById(1L)).thenReturn(java.util.Optional.of(account));
        com.mcm.passport.passport.Passport passport = new com.mcm.passport.passport.Passport(
            "A1234", 2024, 1L, "Nomad Backpack", "애칭",
            java.time.LocalDate.of(2024, 1, 1), "MCM 강남점", null, false,
            java.util.List.of(), com.mcm.passport.passport.UsageFrequency.DAILY);
        when(passportRepository.findAllByOwnerAccountId(1L)).thenReturn(java.util.List.of(passport));

        service.withdraw(1L);

        assertThat(passport.getStatus()).isEqualTo(com.mcm.passport.passport.PassportStatus.DELETED);
    }
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `./gradlew test --tests "com.mcm.passport.account.AccountServiceTest"`
Expected: FAIL — 생성자 시그니처 불일치

- [ ] **Step 3: `AccountService.withdraw` 수정**

```java
    private final com.mcm.passport.passport.PassportRepository passportRepository;

    public void withdraw(Long accountId) {
        Account account = getActiveAccountOrThrow(accountId);
        account.withdraw();
        passportRepository.findAllByOwnerAccountId(accountId)
            .forEach(com.mcm.passport.passport.Passport::softDelete);
    }
```
(`passportRepository` 필드를 `AccountService`의 기존 필드 목록 맨 마지막(`passwordResetMailer` 아래)에 추가하고, 기존 `withdraw` 메서드 본문을 위 내용으로 교체한다. Lombok `@RequiredArgsConstructor`는 필드 선언 순서대로 생성자를 만들므로, 맨 마지막에 추가해야 `newService()` 헬퍼가 쓰는 `(accountRepository, passwordResetTokenRepository, passwordEncoder, jwtTokenProvider(), passwordResetMailer, passportRepository)` 순서와 일치한다.)

- [ ] **Step 4: 테스트 재실행해서 통과 확인**

Run: `./gradlew test --tests "com.mcm.passport.account.AccountServiceTest"`
Expected: PASS

- [ ] **Step 5: 컴파일 확인 후 커밋**

Run: `./gradlew compileJava compileTestJava`
Expected: BUILD SUCCESSFUL

```bash
git add src/main/java/com/mcm/passport/account/AccountService.java src/test/java/com/mcm/passport/account/AccountServiceTest.java
git commit -m "feat: cascade account withdrawal to owned passports"
```

---

## Task 17: Diagnosis 스키마 + 엔티티 + 리포지토리

**Files:**
- Create: `src/main/resources/db/migration/V3__create_diagnosis_table.sql`
- Create: `src/main/java/com/mcm/passport/diagnosis/DiagnosisType.java`
- Create: `src/main/java/com/mcm/passport/diagnosis/OverallGrade.java`
- Create: `src/main/java/com/mcm/passport/diagnosis/Diagnosis.java`
- Create: `src/main/java/com/mcm/passport/diagnosis/DiagnosisRepository.java`
- Test: `src/test/java/com/mcm/passport/diagnosis/DiagnosisRepositoryTest.java`

**Interfaces:**
- Produces: `Diagnosis(Long passportId, DiagnosisType, List<String> imageUrls, Map<String,Integer> itemScores, OverallGrade, String evidenceText)` 생성자. `DiagnosisRepository.findFirstByPassportIdOrderByDiagnosedAtDesc(Long): Optional<Diagnosis>`.

- [ ] **Step 1: Flyway 마이그레이션 작성**

```sql
-- V3__create_diagnosis_table.sql
CREATE TABLE diagnosis (
    id BIGSERIAL PRIMARY KEY,
    passport_id BIGINT NOT NULL REFERENCES passport(id),
    diagnosis_type VARCHAR(20) NOT NULL,
    image_urls TEXT[] NOT NULL,
    item_scores JSONB NOT NULL,
    overall_grade VARCHAR(20) NOT NULL,
    evidence_text VARCHAR(1000) NOT NULL,
    diagnosed_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);
```

- [ ] **Step 2: enum 작성**

```java
package com.mcm.passport.diagnosis;

public enum DiagnosisType {
    SELF, STORE
}
```

```java
package com.mcm.passport.diagnosis;

public enum OverallGrade {
    GOOD, NEEDS_CARE, URGENT
}
```

- [ ] **Step 3: `Diagnosis` 엔티티 작성**

```java
package com.mcm.passport.diagnosis;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Entity
@Table(name = "diagnosis")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Diagnosis {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "passport_id", nullable = false)
    private Long passportId;

    @Enumerated(EnumType.STRING)
    @Column(name = "diagnosis_type", nullable = false)
    private DiagnosisType diagnosisType;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "image_urls", columnDefinition = "text[]", nullable = false)
    private List<String> imageUrls;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "item_scores", columnDefinition = "jsonb", nullable = false)
    private Map<String, Integer> itemScores;

    @Enumerated(EnumType.STRING)
    @Column(name = "overall_grade", nullable = false)
    private OverallGrade overallGrade;

    @Column(name = "evidence_text", nullable = false, length = 1000)
    private String evidenceText;

    @Column(name = "diagnosed_at", nullable = false)
    private LocalDateTime diagnosedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public Diagnosis(Long passportId, DiagnosisType diagnosisType, List<String> imageUrls,
                      Map<String, Integer> itemScores, OverallGrade overallGrade, String evidenceText) {
        this.passportId = passportId;
        this.diagnosisType = diagnosisType;
        this.imageUrls = imageUrls;
        this.itemScores = itemScores;
        this.overallGrade = overallGrade;
        this.evidenceText = evidenceText;
    }

    @PrePersist
    void prePersist() {
        this.createdAt = LocalDateTime.now();
        this.diagnosedAt = this.createdAt;
    }
}
```

- [ ] **Step 4: 리포지토리 작성**

```java
package com.mcm.passport.diagnosis;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface DiagnosisRepository extends JpaRepository<Diagnosis, Long> {
    Optional<Diagnosis> findFirstByPassportIdOrderByDiagnosedAtDesc(Long passportId);
    Page<Diagnosis> findAllByPassportIdOrderByDiagnosedAtDesc(Long passportId, Pageable pageable);
    List<Diagnosis> findAllByPassportId(Long passportId);
}
```

- [ ] **Step 5: 통합 테스트 작성**

```java
package com.mcm.passport.diagnosis;

import com.mcm.passport.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class DiagnosisRepositoryTest extends AbstractIntegrationTest {

    @Autowired
    private DiagnosisRepository diagnosisRepository;

    @Test
    void savesAndFindsLatestByPassportId() {
        diagnosisRepository.save(new Diagnosis(1L, DiagnosisType.SELF, List.of("https://cdn/1.jpg"),
            Map.of("마모", 20), OverallGrade.GOOD, "첫 진단"));
        Diagnosis latest = diagnosisRepository.save(new Diagnosis(1L, DiagnosisType.SELF,
            List.of("https://cdn/2.jpg"), Map.of("마모", 45), OverallGrade.NEEDS_CARE, "두번째 진단"));

        var found = diagnosisRepository.findFirstByPassportIdOrderByDiagnosedAtDesc(1L);

        assertThat(found).isPresent();
        assertThat(found.get().getId()).isEqualTo(latest.getId());
        assertThat(found.get().getItemScores()).containsEntry("마모", 45);
    }
}
```

- [ ] **Step 6: 테스트 실행 (Docker 필요)**

Run: `./gradlew test --tests "com.mcm.passport.diagnosis.DiagnosisRepositoryTest"`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add src/main/resources/db/migration/V3__create_diagnosis_table.sql src/main/java/com/mcm/passport/diagnosis/ src/test/java/com/mcm/passport/diagnosis/DiagnosisRepositoryTest.java
git commit -m "feat: add Diagnosis entity"
```

---

## Task 18: 마모 진단 엔진 (규칙기반 + AI 교체 지점)

**Files:**
- Create: `src/main/java/com/mcm/passport/diagnosis/DiagnosisResult.java`
- Create: `src/main/java/com/mcm/passport/diagnosis/WearDiagnosisEngine.java`
- Create: `src/main/java/com/mcm/passport/diagnosis/RuleBasedWearDiagnosisEngine.java`
- Create: `src/main/java/com/mcm/passport/diagnosis/WearDiagnosisEngineConfig.java`
- Test: `src/test/java/com/mcm/passport/diagnosis/RuleBasedWearDiagnosisEngineTest.java`

**Interfaces:**
- Produces: `WearDiagnosisEngine.diagnose(List<String> imageUrls, Diagnosis previousDiagnosis): DiagnosisResult` — AI 팀원이 나중에 이 인터페이스의 새 구현체(`AiWearDiagnosisEngine`)를 만들고 `wear-diagnosis.engine=ai` 설정만 바꾸면 교체된다. `itemScores`의 키(`마모`,`코팅벗겨짐`,`변색`,`부자재상태`)와 0~100 스케일은 AI팀과 반드시 맞춰야 하는 계약.

- [ ] **Step 1: `DiagnosisResult`, `WearDiagnosisEngine` 작성**

```java
package com.mcm.passport.diagnosis;

import java.util.Map;

public record DiagnosisResult(Map<String, Integer> itemScores, OverallGrade overallGrade, String evidenceText) {
}
```

```java
package com.mcm.passport.diagnosis;

import java.util.List;

public interface WearDiagnosisEngine {
    DiagnosisResult diagnose(List<String> imageUrls, Diagnosis previousDiagnosis);
}
```

- [ ] **Step 2: 실패하는 테스트 작성 (결정론적 규칙 검증)**

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
        assertThat(result.overallGrade()).isEqualTo(OverallGrade.GOOD);
    }

    @Test
    void wearScoreIncreasesFromPreviousDiagnosis() {
        Diagnosis previous = new Diagnosis(1L, DiagnosisType.SELF,
            List.of("https://cdn/old.jpg"), Map.of("마모", 60), OverallGrade.NEEDS_CARE, "이전");

        DiagnosisResult result = engine.diagnose(List.of("https://cdn/1.jpg"), previous);

        assertThat(result.itemScores().get("마모")).isEqualTo(70); // 이전 60 + 사진 1장이라 +10
        assertThat(result.overallGrade()).isEqualTo(OverallGrade.URGENT);
    }

    @Test
    void wearScoreCapsAt100() {
        Diagnosis previous = new Diagnosis(1L, DiagnosisType.SELF,
            List.of("https://cdn/old.jpg"), Map.of("마모", 95), OverallGrade.URGENT, "이전");

        DiagnosisResult result = engine.diagnose(List.of("https://cdn/1.jpg"), previous);

        assertThat(result.itemScores().get("마모")).isEqualTo(100);
    }
}
```

- [ ] **Step 3: 테스트 실행해서 실패 확인**

Run: `./gradlew test --tests "com.mcm.passport.diagnosis.RuleBasedWearDiagnosisEngineTest"`
Expected: FAIL — `RuleBasedWearDiagnosisEngine` 클래스 없음

- [ ] **Step 4: 구현**

```java
package com.mcm.passport.diagnosis;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class RuleBasedWearDiagnosisEngine implements WearDiagnosisEngine {

    private static final int BASELINE_WEAR = 20;

    @Override
    public DiagnosisResult diagnose(List<String> imageUrls, Diagnosis previousDiagnosis) {
        int previousWear = previousDiagnosis != null
            ? previousDiagnosis.getItemScores().getOrDefault("마모", BASELINE_WEAR)
            : BASELINE_WEAR;

        int increment = imageUrls.size() >= 3 ? 5 : 10;
        int wear = Math.min(100, previousWear + increment);
        int coating = Math.max(0, wear - 5);
        int discoloration = Math.max(0, wear - 10);
        int hardware = Math.max(0, wear - 15);

        Map<String, Integer> scores = new LinkedHashMap<>();
        scores.put("마모", wear);
        scores.put("코팅벗겨짐", coating);
        scores.put("변색", discoloration);
        scores.put("부자재상태", hardware);

        OverallGrade grade = toGrade(wear);
        String evidence = "직전 마모 점수 %d에서 %d로 변화, 종합 등급 %s".formatted(previousWear, wear, grade);

        return new DiagnosisResult(scores, grade, evidence);
    }

    private OverallGrade toGrade(int wearScore) {
        if (wearScore >= 70) return OverallGrade.URGENT;
        if (wearScore >= 40) return OverallGrade.NEEDS_CARE;
        return OverallGrade.GOOD;
    }
}
```

- [ ] **Step 5: 테스트 재실행해서 통과 확인**

Run: `./gradlew test --tests "com.mcm.passport.diagnosis.RuleBasedWearDiagnosisEngineTest"`
Expected: PASS

- [ ] **Step 6: 엔진 선택 설정 작성 (AI 구현체 교체 지점)**

```java
package com.mcm.passport.diagnosis;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class WearDiagnosisEngineConfig {

    @Bean
    @ConditionalOnProperty(name = "wear-diagnosis.engine", havingValue = "rule-based", matchIfMissing = true)
    public WearDiagnosisEngine ruleBasedWearDiagnosisEngine() {
        return new RuleBasedWearDiagnosisEngine();
    }
}
```

- [ ] **Step 7: `application.yml`에 기본값 추가**

```yaml
wear-diagnosis:
  engine: rule-based
```
(`notification:` 섹션 위나 아래에 추가)

- [ ] **Step 8: 컴파일 확인 후 커밋**

Run: `./gradlew compileJava compileTestJava`
Expected: BUILD SUCCESSFUL

```bash
git add src/main/java/com/mcm/passport/diagnosis/ src/main/resources/application.yml src/test/java/com/mcm/passport/diagnosis/RuleBasedWearDiagnosisEngineTest.java
git commit -m "feat: add rule-based wear diagnosis engine with AI swap-in point"
```

---

## Task 19: 진단 등록 (POST /api/passports/{id}/diagnoses)

**Files:**
- Create: `src/main/java/com/mcm/passport/diagnosis/dto/DiagnosisResponse.java`
- Create: `src/main/java/com/mcm/passport/diagnosis/DiagnosisService.java`
- Create: `src/main/java/com/mcm/passport/diagnosis/DiagnosisController.java`
- Modify: `src/main/java/com/mcm/passport/common/exception/ErrorCode.java` (변경 없음, `DIAGNOSIS_NOT_FOUND`/`PASSPORT_NOT_FOUND`/`FORBIDDEN` 이미 존재)
- Test: `src/test/java/com/mcm/passport/diagnosis/DiagnosisServiceTest.java`

**Interfaces:**
- Consumes: `PassportRepository.findByIdAndStatus` (Task 10), `ImageStorageService.upload` (Task 12), `WearDiagnosisEngine.diagnose` (Task 18), `DiagnosisRepository.findFirstByPassportIdOrderByDiagnosedAtDesc` (Task 17)
- Produces: `DiagnosisService.submit(Long passportId, Long requesterAccountId, DiagnosisType type, List<MultipartFile> images): DiagnosisResponse`
- **참고:** 이 태스크에서는 진단 등록만 하고, 등급에 따른 Notification 생성은 아직 하지 않는다 — Notification 도메인이 없기 때문. Task 24에서 이어서 연결한다.

- [ ] **Step 1: `DiagnosisResponse` 작성 (이미지 URL은 비공개 데이터라 응답에서 제외)**

```java
package com.mcm.passport.diagnosis.dto;

import com.mcm.passport.diagnosis.Diagnosis;
import com.mcm.passport.diagnosis.DiagnosisType;
import com.mcm.passport.diagnosis.OverallGrade;

import java.time.LocalDateTime;
import java.util.Map;

public record DiagnosisResponse(
    Long id,
    DiagnosisType diagnosisType,
    Map<String, Integer> itemScores,
    OverallGrade overallGrade,
    String evidenceText,
    LocalDateTime diagnosedAt,
    Map<String, Integer> previousItemScores // 비교용, 첫 진단이면 null
) {
    public static DiagnosisResponse from(Diagnosis diagnosis, Diagnosis previous) {
        return new DiagnosisResponse(
            diagnosis.getId(), diagnosis.getDiagnosisType(), diagnosis.getItemScores(),
            diagnosis.getOverallGrade(), diagnosis.getEvidenceText(), diagnosis.getDiagnosedAt(),
            previous != null ? previous.getItemScores() : null
        );
    }
}
```

- [ ] **Step 2: 실패하는 서비스 테스트 작성**

```java
package com.mcm.passport.diagnosis;

import com.mcm.passport.common.exception.ApiException;
import com.mcm.passport.common.exception.ErrorCode;
import com.mcm.passport.common.storage.ImageStorageService;
import com.mcm.passport.diagnosis.dto.DiagnosisResponse;
import com.mcm.passport.passport.Passport;
import com.mcm.passport.passport.PassportRepository;
import com.mcm.passport.passport.PassportStatus;
import com.mcm.passport.passport.UsageFrequency;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class DiagnosisServiceTest {

    @Mock private DiagnosisRepository diagnosisRepository;
    @Mock private PassportRepository passportRepository;
    @Mock private ImageStorageService imageStorageService;
    @Mock private WearDiagnosisEngine wearDiagnosisEngine;

    private DiagnosisService diagnosisService;

    @Test
    void submitRejectsWhenNotOwner() {
        diagnosisService = new DiagnosisService(
            diagnosisRepository, passportRepository, imageStorageService, wearDiagnosisEngine);
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.DAILY);
        when(passportRepository.findByIdAndStatus(10L, PassportStatus.ACTIVE))
            .thenReturn(Optional.of(passport));

        assertThatThrownBy(() -> diagnosisService.submit(10L, 999L, DiagnosisType.SELF, List.of()))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.FORBIDDEN);
    }

    @Test
    void submitUploadsImagesAndDelegatesToEngine() {
        diagnosisService = new DiagnosisService(
            diagnosisRepository, passportRepository, imageStorageService, wearDiagnosisEngine);
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.DAILY);
        when(passportRepository.findByIdAndStatus(1L, PassportStatus.ACTIVE)).thenReturn(Optional.of(passport));
        when(diagnosisRepository.findFirstByPassportIdOrderByDiagnosedAtDesc(1L)).thenReturn(Optional.empty());
        MultipartFile image = new MockMultipartFile("image", "a.jpg", "image/jpeg", "a".getBytes());
        when(imageStorageService.upload(image)).thenReturn("https://cdn/a.jpg");
        when(wearDiagnosisEngine.diagnose(List.of("https://cdn/a.jpg"), null))
            .thenReturn(new DiagnosisResult(Map.of("마모", 25), OverallGrade.GOOD, "근거"));
        when(diagnosisRepository.save(any(Diagnosis.class))).thenAnswer(inv -> inv.getArgument(0));

        DiagnosisResponse response = diagnosisService.submit(1L, 1L, DiagnosisType.SELF, List.of(image));

        assertThat(response.overallGrade()).isEqualTo(OverallGrade.GOOD);
        assertThat(response.previousItemScores()).isNull();
    }
}
```

- [ ] **Step 3: 테스트 실행해서 실패 확인**

Run: `./gradlew test --tests "com.mcm.passport.diagnosis.DiagnosisServiceTest"`
Expected: FAIL — `DiagnosisService` 클래스 없음

- [ ] **Step 4: `DiagnosisService` 구현**

```java
package com.mcm.passport.diagnosis;

import com.mcm.passport.common.exception.ApiException;
import com.mcm.passport.common.exception.ErrorCode;
import com.mcm.passport.common.storage.ImageStorageService;
import com.mcm.passport.diagnosis.dto.DiagnosisResponse;
import com.mcm.passport.passport.Passport;
import com.mcm.passport.passport.PassportRepository;
import com.mcm.passport.passport.PassportStatus;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Transactional
public class DiagnosisService {

    private final DiagnosisRepository diagnosisRepository;
    private final PassportRepository passportRepository;
    private final ImageStorageService imageStorageService;
    private final WearDiagnosisEngine wearDiagnosisEngine;

    public DiagnosisResponse submit(Long passportId, Long requesterAccountId,
                                     DiagnosisType diagnosisType, List<MultipartFile> images) {
        Passport passport = passportRepository.findByIdAndStatus(passportId, PassportStatus.ACTIVE)
            .orElseThrow(() -> new ApiException(ErrorCode.PASSPORT_NOT_FOUND));
        if (!passport.isOwnedBy(requesterAccountId)) {
            throw new ApiException(ErrorCode.FORBIDDEN);
        }

        List<String> imageUrls = images.stream().map(imageStorageService::upload).toList();
        Optional<Diagnosis> previous = diagnosisRepository.findFirstByPassportIdOrderByDiagnosedAtDesc(passportId);
        DiagnosisResult result = wearDiagnosisEngine.diagnose(imageUrls, previous.orElse(null));

        Diagnosis diagnosis = new Diagnosis(passportId, diagnosisType, imageUrls,
            result.itemScores(), result.overallGrade(), result.evidenceText());
        Diagnosis saved = diagnosisRepository.save(diagnosis);

        return DiagnosisResponse.from(saved, previous.orElse(null));
    }
}
```

- [ ] **Step 5: 테스트 재실행해서 통과 확인**

Run: `./gradlew test --tests "com.mcm.passport.diagnosis.DiagnosisServiceTest"`
Expected: PASS

- [ ] **Step 6: 컨트롤러 작성**

```java
package com.mcm.passport.diagnosis;

import com.mcm.passport.common.security.CurrentAccount;
import com.mcm.passport.diagnosis.dto.DiagnosisResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequiredArgsConstructor
public class DiagnosisController {

    private final DiagnosisService diagnosisService;

    @PostMapping(value = "/api/passports/{passportId}/diagnoses", consumes = "multipart/form-data")
    public ResponseEntity<DiagnosisResponse> submit(
            Authentication authentication, @PathVariable Long passportId,
            @RequestParam("diagnosisType") DiagnosisType diagnosisType,
            @RequestPart("images") List<MultipartFile> images) {
        DiagnosisResponse response = diagnosisService.submit(
            passportId, CurrentAccount.id(authentication), diagnosisType, images);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }
}
```

`diagnosisType`은 `@RequestPart`가 아니라 `@RequestParam`으로 받는다 — `@RequestPart`는 파트의 `Content-Type`을 보고 `HttpMessageConverter`로 변환하기 때문에 `DiagnosisType` 같은 enum을 text 파트에서 직접 바인딩하지 못한다. `@RequestParam`은 Spring의 `ConversionService`(문자열→enum 변환 포함)를 타므로 멀티파트 폼의 단순 텍스트 필드에 적합하다. 파일 파트인 `images`는 그대로 `@RequestPart`를 쓴다.

- [ ] **Step 7: 컴파일 확인 후 커밋**

Run: `./gradlew compileJava compileTestJava`
Expected: BUILD SUCCESSFUL

```bash
git add src/main/java/com/mcm/passport/diagnosis/ src/test/java/com/mcm/passport/diagnosis/DiagnosisServiceTest.java
git commit -m "feat: add diagnosis submission endpoint"
```

---

## Task 20: 진단 목록/상세 조회 (GET /api/passports/{id}/diagnoses, GET /api/diagnoses/{id})

**Files:**
- Modify: `src/main/java/com/mcm/passport/diagnosis/DiagnosisService.java` (`list`, `getDetail` 추가)
- Modify: `src/main/java/com/mcm/passport/diagnosis/DiagnosisController.java` (엔드포인트 추가)
- Test: `src/test/java/com/mcm/passport/diagnosis/DiagnosisServiceTest.java` (테스트 추가)

**Interfaces:**
- Produces: `DiagnosisService.list(Long passportId, Long requesterAccountId, Pageable): Page<DiagnosisResponse>`, `DiagnosisService.getDetail(Long diagnosisId, Long requesterAccountId): DiagnosisResponse`

- [ ] **Step 1: 실패하는 테스트 추가**

```java
    @Test
    void getDetailRejectsNonOwner() {
        diagnosisService = new DiagnosisService(
            diagnosisRepository, passportRepository, imageStorageService, wearDiagnosisEngine);
        Diagnosis diagnosis = new Diagnosis(1L, DiagnosisType.SELF, List.of("https://cdn/a.jpg"),
            Map.of("마모", 30), OverallGrade.GOOD, "근거");
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.DAILY);
        when(diagnosisRepository.findById(5L)).thenReturn(Optional.of(diagnosis));
        when(passportRepository.findById(1L)).thenReturn(Optional.of(passport));

        assertThatThrownBy(() -> diagnosisService.getDetail(5L, 999L))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.FORBIDDEN);
    }
```

(파일 상단 import에 `com.mcm.passport.passport.Passport` 등은 이미 있음. `PassportRepository.findById`는 `JpaRepository`가 기본 제공.)

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `./gradlew test --tests "com.mcm.passport.diagnosis.DiagnosisServiceTest"`
Expected: FAIL — `getDetail` 메서드 없음

- [ ] **Step 3: `DiagnosisService`에 메서드 추가**

```java
    public org.springframework.data.domain.Page<DiagnosisResponse> list(
            Long passportId, Long requesterAccountId, org.springframework.data.domain.Pageable pageable) {
        assertOwnership(passportId, requesterAccountId);
        return diagnosisRepository.findAllByPassportIdOrderByDiagnosedAtDesc(passportId, pageable)
            .map(d -> DiagnosisResponse.from(d, null));
    }

    public DiagnosisResponse getDetail(Long diagnosisId, Long requesterAccountId) {
        Diagnosis diagnosis = diagnosisRepository.findById(diagnosisId)
            .orElseThrow(() -> new ApiException(ErrorCode.DIAGNOSIS_NOT_FOUND));
        assertOwnership(diagnosis.getPassportId(), requesterAccountId);
        return DiagnosisResponse.from(diagnosis, null);
    }

    private void assertOwnership(Long passportId, Long requesterAccountId) {
        Passport passport = passportRepository.findById(passportId)
            .orElseThrow(() -> new ApiException(ErrorCode.PASSPORT_NOT_FOUND));
        if (!passport.isOwnedBy(requesterAccountId)) {
            throw new ApiException(ErrorCode.FORBIDDEN);
        }
    }
```

- [ ] **Step 4: 테스트 재실행해서 통과 확인**

Run: `./gradlew test --tests "com.mcm.passport.diagnosis.DiagnosisServiceTest"`
Expected: PASS

- [ ] **Step 5: 컨트롤러에 엔드포인트 추가**

```java
    @GetMapping("/api/passports/{passportId}/diagnoses")
    public ResponseEntity<org.springframework.data.domain.Page<DiagnosisResponse>> list(
            Authentication authentication, @PathVariable Long passportId,
            @org.springframework.data.web.PageableDefault(size = 20) org.springframework.data.domain.Pageable pageable) {
        return ResponseEntity.ok(diagnosisService.list(passportId, CurrentAccount.id(authentication), pageable));
    }

    @GetMapping("/api/diagnoses/{diagnosisId}")
    public ResponseEntity<DiagnosisResponse> getDetail(Authentication authentication, @PathVariable Long diagnosisId) {
        return ResponseEntity.ok(diagnosisService.getDetail(diagnosisId, CurrentAccount.id(authentication)));
    }
```

- [ ] **Step 6: 컴파일 확인 후 커밋**

Run: `./gradlew compileJava compileTestJava`
Expected: BUILD SUCCESSFUL

```bash
git add src/main/java/com/mcm/passport/diagnosis/ src/test/java/com/mcm/passport/diagnosis/DiagnosisServiceTest.java
git commit -m "feat: add diagnosis list and detail endpoints"
```

---

## Task 21: 여권 목록/상세에 최신 진단 정보 반영

**Files:**
- Modify: `src/main/java/com/mcm/passport/passport/dto/PassportSummaryResponse.java` (팩토리 메서드 추가)
- Modify: `src/main/java/com/mcm/passport/passport/PassportService.java` (`DiagnosisRepository` 의존성 추가, `list` 수정)
- Test: `src/test/java/com/mcm/passport/passport/PassportServiceTest.java` (테스트 추가/수정)

**Interfaces:**
- Consumes: `DiagnosisRepository.findFirstByPassportIdOrderByDiagnosedAtDesc` (Task 17)

- [ ] **Step 1: `PassportSummaryResponse`에 진단 정보를 채우는 팩토리 메서드 추가**

```java
    public static PassportSummaryResponse withDiagnosis(
            Passport passport, com.mcm.passport.diagnosis.Diagnosis latestDiagnosis) {
        long ownershipDays = java.time.temporal.ChronoUnit.DAYS.between(
            passport.getPurchaseDate(), LocalDate.now());
        return new PassportSummaryResponse(
            passport.getId(), passport.getModelName(), passport.getNickname(), ownershipDays,
            latestDiagnosis != null ? latestDiagnosis.getOverallGrade().name() : null,
            latestDiagnosis != null ? latestDiagnosis.getDiagnosedAt() : null);
    }
```
(기존 `withoutDiagnosis` 메서드는 그대로 두되, 이후 `PassportService.list`는 `withDiagnosis`를 사용하도록 변경한다.)

- [ ] **Step 2: `PassportServiceTest` 수정 — `DiagnosisRepository` 목 필드 추가, 기존 생성자 호출부 전부 갱신, 진단 포함 테스트로 교체**

테스트 클래스 상단 필드 목록(`imageStorageService` 선언 아래)에 추가:

```java
    @Mock
    private com.mcm.passport.diagnosis.DiagnosisRepository diagnosisRepository;
```

`PassportService` 생성자에 파라미터가 하나 늘어나므로, 이 파일에 이미 있는 모든 `new PassportService(passportRepository, imageStorageService)` 호출(`registerRejectsInvalidSerialFormat`, `registerRejectsActiveDuplicate`, `registerSucceedsWithReceiptAndBaselineImages`, `registerAllowsMissingReceipt`, `getDetailRejectsNonOwner`, `getDetailThrowsNotFoundWhenMissing`, `updateChangesNicknameAndUsageFrequency`, `deleteSoftDeletesPassport`)를 `new PassportService(passportRepository, imageStorageService, diagnosisRepository)`로 일괄 교체한다 (이 테스트들은 `diagnosisRepository`를 실제로 쓰지 않으므로 별도 `when(...)` 설정 없이 인자만 추가하면 된다).

이어서 기존 `listReturnsOnlyOwnersActivePassports` 테스트를 삭제하고 아래로 교체한다:

```java
    @Test
    void listIncludesLatestDiagnosisGradeAndDate() {
        passportService = new PassportService(passportRepository, imageStorageService, diagnosisRepository);
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.OCCASIONAL);
        org.springframework.data.domain.Pageable pageable = org.springframework.data.domain.PageRequest.of(0, 20);
        when(passportRepository.findAllByOwnerAccountIdAndStatus(1L, PassportStatus.ACTIVE, pageable))
            .thenReturn(new org.springframework.data.domain.PageImpl<>(List.of(passport)));
        com.mcm.passport.diagnosis.Diagnosis diagnosis = new com.mcm.passport.diagnosis.Diagnosis(
            passport.getId(), com.mcm.passport.diagnosis.DiagnosisType.SELF, List.of("https://cdn/1.jpg"),
            java.util.Map.of("마모", 45), com.mcm.passport.diagnosis.OverallGrade.NEEDS_CARE, "근거");
        when(diagnosisRepository.findFirstByPassportIdOrderByDiagnosedAtDesc(any()))
            .thenReturn(java.util.Optional.of(diagnosis));

        var page = passportService.list(1L, pageable);

        assertThat(page.getContent()).hasSize(1);
        assertThat(page.getContent().get(0).overallGrade()).isEqualTo("NEEDS_CARE");
    }
```

(파일 상단 import에 `static org.mockito.ArgumentMatchers.any;` 추가 — `passport`가 저장 전이라 `id`가 `null`일 수 있으므로 특정 값 대신 `any()` 매처로 어떤 Long 인자든 매치시킨다.)

- [ ] **Step 3: 테스트 실행해서 실패 확인**

Run: `./gradlew test --tests "com.mcm.passport.passport.PassportServiceTest"`
Expected: FAIL — `PassportService` 생성자에 `DiagnosisRepository` 파라미터 없음

- [ ] **Step 4: `PassportService` 생성자 및 `list` 메서드 수정**

```java
    private final com.mcm.passport.diagnosis.DiagnosisRepository diagnosisRepository;

    public org.springframework.data.domain.Page<PassportSummaryResponse> list(
            Long ownerAccountId, org.springframework.data.domain.Pageable pageable) {
        return passportRepository.findAllByOwnerAccountIdAndStatus(ownerAccountId, PassportStatus.ACTIVE, pageable)
            .map(passport -> PassportSummaryResponse.withDiagnosis(passport,
                diagnosisRepository.findFirstByPassportIdOrderByDiagnosedAtDesc(passport.getId()).orElse(null)));
    }
```
(`diagnosisRepository` 필드를 클래스 필드 목록에 추가하고, 기존 `list` 메서드 본문을 교체. import에 `com.mcm.passport.diagnosis.DiagnosisRepository` 추가)

- [ ] **Step 5: 테스트 재실행해서 통과 확인**

Run: `./gradlew test --tests "com.mcm.passport.passport.PassportServiceTest"`
Expected: PASS

- [ ] **Step 6: 컴파일 확인 후 커밋**

Run: `./gradlew compileJava compileTestJava`
Expected: BUILD SUCCESSFUL

```bash
git add src/main/java/com/mcm/passport/passport/ src/test/java/com/mcm/passport/passport/PassportServiceTest.java
git commit -m "feat: enrich passport list with latest diagnosis grade"
```

---

## Task 22: Notification 스키마 + 엔티티 + 리포지토리

**Files:**
- Create: `src/main/resources/db/migration/V4__create_notification_table.sql`
- Create: `src/main/java/com/mcm/passport/notification/NotificationType.java`
- Create: `src/main/java/com/mcm/passport/notification/Notification.java`
- Create: `src/main/java/com/mcm/passport/notification/NotificationRepository.java`
- Test: `src/test/java/com/mcm/passport/notification/NotificationRepositoryTest.java`

**Interfaces:**
- Produces: `Notification(Long passportId, NotificationType, Map<String,Object> reasonFactors, String message, Integer overallScore)`, `notification.markRead()`, `notification.markDismissed()`.

> **2026-08-11 재기획 변경사항 (2차 멘토링 기획서 반영):** 와이어프레임에 있던 "기념(마일스톤)" 알림 타입과 "종합 O점" 표시용 점수 필드가 이번 MVP 범위로 승격됨. 아래 마이그레이션/엔티티/enum이 이를 반영해 최신화됨 (기존 브리핑 대비 변경: `MILESTONE` enum 값 추가, `overall_score` 컬럼 추가). `overallScore`는 진단 기반 알림(SELF_CARE/STORE_SERVICE/REPURCHASE)에서만 채워짐 — 최신 `Diagnosis.itemScores`(4개 항목, 0~100)의 평균을 반올림해 스냅샷으로 저장 (Task 23에서 계산). `MILESTONE` 알림은 진단과 무관하므로 `overallScore`는 항상 `null`.

- [ ] **Step 1: Flyway 마이그레이션 작성**

```sql
-- V4__create_notification_table.sql
CREATE TABLE notification (
    id BIGSERIAL PRIMARY KEY,
    passport_id BIGINT NOT NULL REFERENCES passport(id),
    type VARCHAR(30) NOT NULL,
    reason_factors JSONB NOT NULL,
    message VARCHAR(500) NOT NULL,
    overall_score INTEGER,
    read BOOLEAN NOT NULL DEFAULT false,
    dismissed BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);
```

- [ ] **Step 2: enum 작성**

```java
package com.mcm.passport.notification;

public enum NotificationType {
    SELF_CARE, STORE_SERVICE, REPURCHASE, MILESTONE
}
```

- [ ] **Step 3: `Notification` 엔티티 작성**

```java
package com.mcm.passport.notification;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.util.Map;

@Entity
@Table(name = "notification")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Notification {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "passport_id", nullable = false)
    private Long passportId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private NotificationType type;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "reason_factors", columnDefinition = "jsonb", nullable = false)
    private Map<String, Object> reasonFactors;

    @Column(nullable = false, length = 500)
    private String message;

    @Column(name = "overall_score")
    private Integer overallScore;

    @Column(nullable = false)
    private boolean read;

    @Column(nullable = false)
    private boolean dismissed;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public Notification(Long passportId, NotificationType type, Map<String, Object> reasonFactors, String message,
                         Integer overallScore) {
        this.passportId = passportId;
        this.type = type;
        this.reasonFactors = reasonFactors;
        this.message = message;
        this.overallScore = overallScore;
        this.read = false;
        this.dismissed = false;
    }

    @PrePersist
    void prePersist() {
        this.createdAt = LocalDateTime.now();
    }

    public void markRead() {
        this.read = true;
    }

    public void markDismissed() {
        this.dismissed = true;
    }
}
```

- [ ] **Step 4: 리포지토리 작성**

```java
package com.mcm.passport.notification;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;

public interface NotificationRepository extends JpaRepository<Notification, Long> {
    Page<Notification> findAllByPassportIdOrderByCreatedAtDesc(Long passportId, Pageable pageable);
    List<Notification> findAllByPassportIdAndReadTrue(Long passportId);
    boolean existsByPassportIdAndTypeAndCreatedAtAfter(Long passportId, NotificationType type, LocalDateTime after);
}
```

- [ ] **Step 5: 통합 테스트 작성**

```java
package com.mcm.passport.notification;

import com.mcm.passport.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.LocalDateTime;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class NotificationRepositoryTest extends AbstractIntegrationTest {

    @Autowired
    private NotificationRepository notificationRepository;

    @Test
    void savesAndDetectsRecentReminder() {
        notificationRepository.save(new Notification(1L, NotificationType.SELF_CARE,
            Map.of("사용빈도", "DAILY"), "재진단할 시기가 지났어요.", 62));

        boolean exists = notificationRepository.existsByPassportIdAndTypeAndCreatedAtAfter(
            1L, NotificationType.SELF_CARE, LocalDateTime.now().minusDays(1));

        assertThat(exists).isTrue();
    }
}
```

- [ ] **Step 6: 테스트 실행 (Docker 필요)**

Run: `./gradlew test --tests "com.mcm.passport.notification.NotificationRepositoryTest"`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add src/main/resources/db/migration/V4__create_notification_table.sql src/main/java/com/mcm/passport/notification/ src/test/java/com/mcm/passport/notification/NotificationRepositoryTest.java
git commit -m "feat: add Notification entity"
```

---

## Task 23: Lifecycle Curator 알림 분기 로직 (독립 유닛)

**Files:**
- Create: `src/main/java/com/mcm/passport/common/config/ClockConfig.java`
- Create: `src/main/java/com/mcm/passport/notification/NotificationService.java`
- Test: `src/test/java/com/mcm/passport/notification/NotificationServiceTest.java`

**Interfaces:**
- Produces: `NotificationService.evaluateAfterDiagnosis(Passport passport, Diagnosis diagnosis): void` — GOOD은 알림 없음, NEEDS_CARE→SELF_CARE, URGENT→STORE_SERVICE. 이 태스크에서는 아직 어디에서도 호출되지 않는 독립 유닛으로만 구현하고 테스트한다 (Task 24에서 진단 등록에 연결).

> **2026-08-11 재기획 변경사항:** Task 22에서 `Notification.overallScore` 필드가 추가됨에 따라, 진단 기반 알림(SELF_CARE/STORE_SERVICE) 생성 시 `diagnosis.getItemScores()`(4개 항목, 0~100)의 평균을 반올림해 스냅샷으로 채운다. `MILESTONE` 알림(소유기간 마일스톤 기반, 진단과 무관)은 이 태스크의 범위가 아니라 Task 26(재진단 리마인드 스케줄러)에서 함께 다룬다.

- [ ] **Step 1: 테스트에서 시간을 고정할 수 있도록 `Clock` 빈 등록**

```java
package com.mcm.passport.common.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

@Configuration
public class ClockConfig {

    @Bean
    public Clock clock() {
        return Clock.systemDefaultZone();
    }
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

```java
package com.mcm.passport.notification;

import com.mcm.passport.diagnosis.Diagnosis;
import com.mcm.passport.diagnosis.DiagnosisType;
import com.mcm.passport.diagnosis.OverallGrade;
import com.mcm.passport.passport.Passport;
import com.mcm.passport.passport.UsageFrequency;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class NotificationServiceTest {

    @Mock
    private NotificationRepository notificationRepository;

    private final Clock fixedClock = Clock.fixed(
        LocalDate.of(2026, 8, 5).atStartOfDay(ZoneId.systemDefault()).toInstant(), ZoneId.systemDefault());

    private NotificationService notificationService;

    @Test
    void goodGradeCreatesNoNotification() {
        notificationService = new NotificationService(notificationRepository, fixedClock);
        Passport passport = passportWithPurchaseDate(LocalDate.of(2024, 1, 1));
        Diagnosis diagnosis = new Diagnosis(1L, DiagnosisType.SELF, List.of("https://cdn/1.jpg"),
            Map.of("마모", 20), OverallGrade.GOOD, "근거");

        notificationService.evaluateAfterDiagnosis(passport, diagnosis);

        verify(notificationRepository, never()).save(any());
    }

    @Test
    void needsCareGradeCreatesSelfCareNotification() {
        notificationService = new NotificationService(notificationRepository, fixedClock);
        Passport passport = passportWithPurchaseDate(LocalDate.of(2024, 1, 1));
        Diagnosis diagnosis = new Diagnosis(1L, DiagnosisType.SELF, List.of("https://cdn/1.jpg"),
            Map.of("마모", 50), OverallGrade.NEEDS_CARE, "근거");

        notificationService.evaluateAfterDiagnosis(passport, diagnosis);

        verify(notificationRepository).save(argThat(n -> n.getType() == NotificationType.SELF_CARE));
    }

    @Test
    void urgentGradeCreatesStoreServiceNotification() {
        notificationService = new NotificationService(notificationRepository, fixedClock);
        Passport passport = passportWithPurchaseDate(LocalDate.of(2024, 1, 1));
        Diagnosis diagnosis = new Diagnosis(1L, DiagnosisType.SELF, List.of("https://cdn/1.jpg"),
            Map.of("마모", 80), OverallGrade.URGENT, "근거");

        notificationService.evaluateAfterDiagnosis(passport, diagnosis);

        verify(notificationRepository).save(argThat(n -> n.getType() == NotificationType.STORE_SERVICE));
    }

    private Passport passportWithPurchaseDate(LocalDate purchaseDate) {
        return new Passport("A1234", purchaseDate.getYear(), 1L, "Nomad Backpack", "애칭",
            purchaseDate, "MCM 강남점", null, false, List.of(), UsageFrequency.DAILY);
    }
}
```

- [ ] **Step 3: 테스트 실행해서 실패 확인**

Run: `./gradlew test --tests "com.mcm.passport.notification.NotificationServiceTest"`
Expected: FAIL — `NotificationService` 클래스 없음

- [ ] **Step 4: `NotificationService.evaluateAfterDiagnosis` 구현**

```java
package com.mcm.passport.notification;

import com.mcm.passport.diagnosis.Diagnosis;
import com.mcm.passport.passport.Passport;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Map;

@RequiredArgsConstructor
@Service
public class NotificationService {

    private final NotificationRepository notificationRepository;
    private final Clock clock;

    public void evaluateAfterDiagnosis(Passport passport, Diagnosis diagnosis) {
        Map<String, Object> reasonFactors = buildReasonFactors(passport, diagnosis);
        Integer overallScore = averageScore(diagnosis);
        switch (diagnosis.getOverallGrade()) {
            case NEEDS_CARE -> create(passport.getId(), NotificationType.SELF_CARE, reasonFactors,
                "마모가 진행되고 있어요. 셀프케어 가이드를 확인해보세요.", overallScore);
            case URGENT -> create(passport.getId(), NotificationType.STORE_SERVICE, reasonFactors,
                "상태가 심각해요. 공식 서비스 예약을 고려해보세요.", overallScore);
            case GOOD -> {
                // 알림 없음
            }
        }
    }

    private Integer averageScore(Diagnosis diagnosis) {
        return (int) Math.round(diagnosis.getItemScores().values().stream()
            .mapToInt(Integer::intValue).average().orElse(0));
    }

    private Map<String, Object> buildReasonFactors(Passport passport, Diagnosis diagnosis) {
        long ownershipDays = ChronoUnit.DAYS.between(passport.getPurchaseDate(), LocalDate.now(clock));
        return Map.of(
            "마모도", diagnosis.getItemScores(),
            "사용빈도", passport.getUsageFrequency().name(),
            "계절", currentSeason(),
            "구매경과일", ownershipDays
        );
    }

    private String currentSeason() {
        int month = LocalDate.now(clock).getMonthValue();
        if (month >= 3 && month <= 5) return "봄";
        if (month >= 6 && month <= 8) return "여름";
        if (month >= 9 && month <= 11) return "가을";
        return "겨울";
    }

    private void create(Long passportId, NotificationType type, Map<String, Object> reasonFactors, String message,
                         Integer overallScore) {
        notificationRepository.save(new Notification(passportId, type, reasonFactors, message, overallScore));
    }
}
```

- [ ] **Step 5: 테스트 재실행해서 통과 확인**

Run: `./gradlew test --tests "com.mcm.passport.notification.NotificationServiceTest"`
Expected: PASS

- [ ] **Step 6: 컴파일 확인 후 커밋**

Run: `./gradlew compileJava compileTestJava`
Expected: BUILD SUCCESSFUL

```bash
git add src/main/java/com/mcm/passport/common/config/ClockConfig.java src/main/java/com/mcm/passport/notification/NotificationType.java src/main/java/com/mcm/passport/notification/NotificationService.java src/test/java/com/mcm/passport/notification/NotificationServiceTest.java
git commit -m "feat: add Lifecycle Curator notification rule logic"
```

---

## Task 24: 진단 등록에 알림 평가 연결

**Files:**
- Modify: `src/main/java/com/mcm/passport/diagnosis/DiagnosisService.java` (`NotificationService` 의존성 추가, `submit`에서 호출)
- Test: `src/test/java/com/mcm/passport/diagnosis/DiagnosisServiceTest.java` (테스트 추가)

**Interfaces:**
- Consumes: `NotificationService.evaluateAfterDiagnosis(Passport, Diagnosis)` (Task 23)

- [ ] **Step 1: `NotificationService` 목 필드 추가, 기존 생성자 호출부 갱신, 실패하는 테스트 추가**

테스트 클래스 상단 필드 목록(`wearDiagnosisEngine` 선언 아래)에 추가:

```java
    @Mock
    private com.mcm.passport.notification.NotificationService notificationService;
```

`DiagnosisService` 생성자에 파라미터가 하나 늘어나므로, 이 파일에 이미 있는 모든 `new DiagnosisService(diagnosisRepository, passportRepository, imageStorageService, wearDiagnosisEngine)` 호출(`submitRejectsWhenNotOwner`, `submitUploadsImagesAndDelegatesToEngine`, Task 20에서 추가한 `getDetailRejectsNonOwner`)을 `new DiagnosisService(diagnosisRepository, passportRepository, imageStorageService, wearDiagnosisEngine, notificationService)`로 일괄 교체한다. 이어서 새 테스트를 추가한다:

```java
    @Test
    void submitTriggersNotificationEvaluation() {
        diagnosisService = new DiagnosisService(diagnosisRepository, passportRepository,
            imageStorageService, wearDiagnosisEngine, notificationService);
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.DAILY);
        when(passportRepository.findByIdAndStatus(1L, PassportStatus.ACTIVE)).thenReturn(Optional.of(passport));
        when(diagnosisRepository.findFirstByPassportIdOrderByDiagnosedAtDesc(1L)).thenReturn(Optional.empty());
        MultipartFile image = new MockMultipartFile("image", "a.jpg", "image/jpeg", "a".getBytes());
        when(imageStorageService.upload(image)).thenReturn("https://cdn/a.jpg");
        when(wearDiagnosisEngine.diagnose(List.of("https://cdn/a.jpg"), null))
            .thenReturn(new DiagnosisResult(Map.of("마모", 25), OverallGrade.GOOD, "근거"));
        when(diagnosisRepository.save(any(Diagnosis.class))).thenAnswer(inv -> inv.getArgument(0));

        diagnosisService.submit(1L, 1L, DiagnosisType.SELF, List.of(image));

        verify(notificationService).evaluateAfterDiagnosis(eq(passport), any(Diagnosis.class));
    }
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `./gradlew test --tests "com.mcm.passport.diagnosis.DiagnosisServiceTest"`
Expected: FAIL — 생성자 시그니처 불일치

- [ ] **Step 3: `DiagnosisService.submit`에 알림 평가 호출 추가**

```java
    private final com.mcm.passport.notification.NotificationService notificationService;

    public DiagnosisResponse submit(Long passportId, Long requesterAccountId,
                                     DiagnosisType diagnosisType, List<MultipartFile> images) {
        Passport passport = passportRepository.findByIdAndStatus(passportId, PassportStatus.ACTIVE)
            .orElseThrow(() -> new ApiException(ErrorCode.PASSPORT_NOT_FOUND));
        if (!passport.isOwnedBy(requesterAccountId)) {
            throw new ApiException(ErrorCode.FORBIDDEN);
        }

        List<String> imageUrls = images.stream().map(imageStorageService::upload).toList();
        Optional<Diagnosis> previous = diagnosisRepository.findFirstByPassportIdOrderByDiagnosedAtDesc(passportId);
        DiagnosisResult result = wearDiagnosisEngine.diagnose(imageUrls, previous.orElse(null));

        Diagnosis diagnosis = new Diagnosis(passportId, diagnosisType, imageUrls,
            result.itemScores(), result.overallGrade(), result.evidenceText());
        Diagnosis saved = diagnosisRepository.save(diagnosis);
        notificationService.evaluateAfterDiagnosis(passport, saved);

        return DiagnosisResponse.from(saved, previous.orElse(null));
    }
```
(`notificationService` 필드를 클래스 필드 목록에 추가하고, 기존 `submit` 메서드 본문을 위 내용으로 교체. import에 `com.mcm.passport.notification.NotificationService` 추가)

- [ ] **Step 4: 테스트 재실행해서 통과 확인**

Run: `./gradlew test --tests "com.mcm.passport.diagnosis.DiagnosisServiceTest"`
Expected: PASS

- [ ] **Step 5: 컴파일 확인 후 커밋**

Run: `./gradlew compileJava compileTestJava`
Expected: BUILD SUCCESSFUL

```bash
git add src/main/java/com/mcm/passport/diagnosis/DiagnosisService.java src/test/java/com/mcm/passport/diagnosis/DiagnosisServiceTest.java
git commit -m "feat: trigger notification evaluation after diagnosis submission"
```

---

## Task 25: 알림 목록/읽음/무시 (GET, PATCH /api/passports/{id}/notifications)

**Files:**
- Create: `src/main/java/com/mcm/passport/notification/dto/NotificationResponse.java`
- Modify: `src/main/java/com/mcm/passport/notification/NotificationService.java` (`list`, `markRead`, `markDismiss` 추가, `PassportRepository` 의존성 추가)
- Create: `src/main/java/com/mcm/passport/notification/NotificationController.java`
- Test: `src/test/java/com/mcm/passport/notification/NotificationServiceTest.java` (테스트 추가)

**Interfaces:**
- Produces: `NotificationService.list(Long passportId, Long requesterAccountId, Pageable): Page<NotificationResponse>`, `markRead(Long notificationId, Long requesterAccountId): void`, `markDismiss(Long notificationId, Long requesterAccountId): void`

- [ ] **Step 1: `NotificationResponse` 작성**

```java
package com.mcm.passport.notification.dto;

import com.mcm.passport.notification.Notification;
import com.mcm.passport.notification.NotificationType;

import java.time.LocalDateTime;
import java.util.Map;

public record NotificationResponse(
    Long id, NotificationType type, Map<String, Object> reasonFactors,
    String message, Integer overallScore, boolean read, boolean dismissed, LocalDateTime createdAt
) {
    public static NotificationResponse from(Notification notification) {
        return new NotificationResponse(
            notification.getId(), notification.getType(), notification.getReasonFactors(),
            notification.getMessage(), notification.getOverallScore(), notification.isRead(),
            notification.isDismissed(), notification.getCreatedAt());
    }
}
```

- [ ] **Step 2: 테스트 클래스에 `PassportRepository` 목 필드 추가 후 실패하는 테스트 추가**

`NotificationServiceTest` 클래스 상단 필드 목록(`notificationRepository` 선언 바로 아래)에 다음을 추가한다:

```java
    @Mock
    private com.mcm.passport.passport.PassportRepository passportRepository;
```

그리고 기존 세 테스트(`goodGradeCreatesNoNotification`, `needsCareGradeCreatesSelfCareNotification`, `urgentGradeCreatesStoreServiceNotification`)의 `new NotificationService(notificationRepository, fixedClock)` 호출을 전부 `new NotificationService(notificationRepository, passportRepository, fixedClock)`로 교체한다 (이 세 테스트는 `passportRepository`를 사용하지 않지만 생성자 시그니처가 바뀌므로 인자만 맞춰준다). 이어서 새 테스트를 추가한다:

```java
    @Test
    void markReadRejectsNonOwner() {
        notificationService = new NotificationService(notificationRepository, passportRepository, fixedClock);
        Notification notification = new Notification(1L, NotificationType.SELF_CARE,
            Map.of("사용빈도", "DAILY"), "메시지", 62);
        Passport passport = passportWithPurchaseDate(LocalDate.of(2024, 1, 1));
        when(notificationRepository.findById(5L)).thenReturn(java.util.Optional.of(notification));
        when(passportRepository.findById(1L)).thenReturn(java.util.Optional.of(passport));

        assertThatThrownBy(() -> notificationService.markRead(5L, 999L))
            .isInstanceOf(com.mcm.passport.common.exception.ApiException.class)
            .extracting(e -> ((com.mcm.passport.common.exception.ApiException) e).getErrorCode())
            .isEqualTo(com.mcm.passport.common.exception.ErrorCode.FORBIDDEN);
    }
```

(파일 상단 import에 `static org.assertj.core.api.Assertions.assertThatThrownBy;` 추가)

- [ ] **Step 3: 테스트 실행해서 실패 확인**

Run: `./gradlew test --tests "com.mcm.passport.notification.NotificationServiceTest"`
Expected: FAIL — 생성자 시그니처 불일치, `markRead` 메서드 없음

- [ ] **Step 4: `NotificationService`에 메서드 및 생성자 파라미터 추가**

`passportRepository` 필드를 `notificationRepository` 필드 바로 아래, `clock` 필드 위에 추가한다 (Lombok `@RequiredArgsConstructor`는 필드 선언 순서대로 생성자 파라미터를 만들기 때문에, 테스트에서 쓴 `new NotificationService(notificationRepository, passportRepository, fixedClock)` 순서와 맞아야 한다):

```java
    private final com.mcm.passport.passport.PassportRepository passportRepository;

    public org.springframework.data.domain.Page<com.mcm.passport.notification.dto.NotificationResponse> list(
            Long passportId, Long requesterAccountId, org.springframework.data.domain.Pageable pageable) {
        assertOwnership(passportId, requesterAccountId);
        return notificationRepository.findAllByPassportIdOrderByCreatedAtDesc(passportId, pageable)
            .map(com.mcm.passport.notification.dto.NotificationResponse::from);
    }

    public void markRead(Long notificationId, Long requesterAccountId) {
        Notification notification = getOwnedNotification(notificationId, requesterAccountId);
        notification.markRead();
    }

    public void markDismiss(Long notificationId, Long requesterAccountId) {
        Notification notification = getOwnedNotification(notificationId, requesterAccountId);
        notification.markDismissed();
    }

    private Notification getOwnedNotification(Long notificationId, Long requesterAccountId) {
        Notification notification = notificationRepository.findById(notificationId)
            .orElseThrow(() -> new com.mcm.passport.common.exception.ApiException(
                com.mcm.passport.common.exception.ErrorCode.NOTIFICATION_NOT_FOUND));
        assertOwnership(notification.getPassportId(), requesterAccountId);
        return notification;
    }

    private void assertOwnership(Long passportId, Long requesterAccountId) {
        com.mcm.passport.passport.Passport passport = passportRepository.findById(passportId)
            .orElseThrow(() -> new com.mcm.passport.common.exception.ApiException(
                com.mcm.passport.common.exception.ErrorCode.PASSPORT_NOT_FOUND));
        if (!passport.isOwnedBy(requesterAccountId)) {
            throw new com.mcm.passport.common.exception.ApiException(
                com.mcm.passport.common.exception.ErrorCode.FORBIDDEN);
        }
    }
```
(`passportRepository` 필드를 클래스 필드 목록 맨 위에 추가 — Lombok `@RequiredArgsConstructor`가 생성자 순서를 필드 선언 순서대로 만들기 때문에, 기존 테스트에서 `new NotificationService(notificationRepository, passportRepository, fixedClock)` 순서로 호출한다)

- [ ] **Step 5: 테스트 재실행해서 통과 확인**

Run: `./gradlew test --tests "com.mcm.passport.notification.NotificationServiceTest"`
Expected: PASS

- [ ] **Step 6: 컨트롤러 작성**

```java
package com.mcm.passport.notification;

import com.mcm.passport.common.security.CurrentAccount;
import com.mcm.passport.notification.dto.NotificationResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationService notificationService;

    @GetMapping("/api/passports/{passportId}/notifications")
    public ResponseEntity<Page<NotificationResponse>> list(
            Authentication authentication, @PathVariable Long passportId,
            @PageableDefault(size = 20) Pageable pageable) {
        return ResponseEntity.ok(
            notificationService.list(passportId, CurrentAccount.id(authentication), pageable));
    }

    @PatchMapping("/api/notifications/{id}/read")
    public ResponseEntity<Void> markRead(Authentication authentication, @PathVariable Long id) {
        notificationService.markRead(id, CurrentAccount.id(authentication));
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/api/notifications/{id}/dismiss")
    public ResponseEntity<Void> markDismiss(Authentication authentication, @PathVariable Long id) {
        notificationService.markDismiss(id, CurrentAccount.id(authentication));
        return ResponseEntity.noContent().build();
    }
}
```

- [ ] **Step 7: 컴파일 확인 후 커밋**

Run: `./gradlew compileJava compileTestJava`
Expected: BUILD SUCCESSFUL

```bash
git add src/main/java/com/mcm/passport/notification/ src/test/java/com/mcm/passport/notification/NotificationServiceTest.java
git commit -m "feat: add notification list/read/dismiss endpoints"
```

---

## Task 26: 재진단 리마인드 스케줄러

**Files:**
- Modify: `src/main/java/com/mcm/passport/notification/NotificationService.java` (`generateReminders` 추가)
- Create: `src/main/java/com/mcm/passport/notification/ReminderScheduler.java`
- Modify: `src/main/java/com/mcm/passport/PassportApplication.java` (`@EnableScheduling` 추가)
- Test: `src/test/java/com/mcm/passport/notification/NotificationServiceTest.java` (테스트 추가)

**Interfaces:**
- Consumes: `PassportRepository.findAllByStatus(PassportStatus.ACTIVE)` (Task 10), `DiagnosisRepository.findFirstByPassportIdOrderByDiagnosedAtDesc` (Task 17)
- Produces: `NotificationService.generateReminders(): void` — `ReminderScheduler`가 매일 1회 호출. 이 메서드 안에서 SELF_CARE 재진단 리마인드뿐 아니라 **MILESTONE(기념) 알림**도 함께 평가한다 (2026-08-11 재기획 결정, 아래 참고).

> **2026-08-11 재기획 변경사항:** 기념(마일스톤) 알림이 이번 MVP 범위로 승격됨. 소유일수(`purchaseDate` 기준, 진단 활동과 무관)가 고정 임계값 목록(`MILESTONE_DAYS = {100, 365, 1000}`일)과 정확히 일치하는 날 `NotificationType.MILESTONE` 알림을 1건 생성한다. 스케줄러가 매일 1회만 도는 구조라 특정 소유일수는 하루에 한 번만 도달하므로, SELF_CARE 리마인드처럼 별도 쿨다운 체크는 필요 없다. `overallScore`는 진단과 무관하므로 `null`.
>
> **Task 25 리뷰에서 나온 수정사항 반영:** `NotificationService`에 `@Transactional`(클래스 레벨)이 빠져 있으면 `markRead`/`markDismiss`가 조회한 엔티티를 저장 호출 없이 변경만 해서 실제로 DB에 반영이 안 되는 버그가 있었음(Task 25 리뷰에서 발견·수정, `AccountService`/`PassportService`와 동일한 패턴으로 통일). 이 태스크가 클래스 전체를 덮어쓰므로, 아래 코드에도 `@Transactional`을 반드시 유지한다 — 빠뜨리면 Task 25의 수정이 되돌아간다.

- [ ] **Step 1: 실패하는 테스트 추가**

테스트 클래스 상단에 `@Mock private com.mcm.passport.diagnosis.DiagnosisRepository diagnosisRepository;` 필드를 추가한다 (Task 25에서 추가한 `passportRepository` 필드는 그대로 재사용). 그리고 Task 25에서 만든 `markReadRejectsNonOwner`를 포함한 모든 기존 테스트의 `new NotificationService(notificationRepository, passportRepository, fixedClock)` 3-인자 호출을 아래 6-인자 시그니처로 교체한다: `new NotificationService(notificationRepository, passportRepository, diagnosisRepository, fixedClock, 90, 30)`.

```java
    @Test
    void generateRemindersCreatesReminderWhenOverThreshold() {
        notificationService = new NotificationService(
            notificationRepository, passportRepository, diagnosisRepository, fixedClock, 90, 30);
        Passport passport = passportWithPurchaseDate(LocalDate.of(2024, 1, 1)); // 기준일로부터 900일 이상 경과
        when(passportRepository.findAllByStatus(com.mcm.passport.passport.PassportStatus.ACTIVE))
            .thenReturn(List.of(passport));
        when(diagnosisRepository.findFirstByPassportIdOrderByDiagnosedAtDesc(passport.getId()))
            .thenReturn(Optional.empty());
        when(notificationRepository.existsByPassportIdAndTypeAndCreatedAtAfter(
            eq(passport.getId()), eq(NotificationType.SELF_CARE), any())).thenReturn(false);

        notificationService.generateReminders();

        verify(notificationRepository).save(argThat(n -> n.getType() == NotificationType.SELF_CARE));
    }

    @Test
    void generateRemindersSkipsWhenAlreadyReminded() {
        notificationService = new NotificationService(
            notificationRepository, passportRepository, diagnosisRepository, fixedClock, 90, 30);
        Passport passport = passportWithPurchaseDate(LocalDate.of(2024, 1, 1));
        when(passportRepository.findAllByStatus(com.mcm.passport.passport.PassportStatus.ACTIVE))
            .thenReturn(List.of(passport));
        when(diagnosisRepository.findFirstByPassportIdOrderByDiagnosedAtDesc(passport.getId()))
            .thenReturn(Optional.empty());
        when(notificationRepository.existsByPassportIdAndTypeAndCreatedAtAfter(
            eq(passport.getId()), eq(NotificationType.SELF_CARE), any())).thenReturn(true);

        notificationService.generateReminders();

        verify(notificationRepository, never()).save(any());
    }
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `./gradlew test --tests "com.mcm.passport.notification.NotificationServiceTest"`
Expected: FAIL — 생성자 시그니처 불일치, `generateReminders` 없음

- [ ] **Step 3: `NotificationService`에 `generateReminders` 및 관련 필드 추가**

```java
package com.mcm.passport.notification;

import com.mcm.passport.common.exception.ApiException;
import com.mcm.passport.common.exception.ErrorCode;
import com.mcm.passport.diagnosis.Diagnosis;
import com.mcm.passport.diagnosis.DiagnosisRepository;
import com.mcm.passport.notification.dto.NotificationResponse;
import com.mcm.passport.passport.Passport;
import com.mcm.passport.passport.PassportRepository;
import com.mcm.passport.passport.PassportStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;

@Service
@org.springframework.transaction.annotation.Transactional
public class NotificationService {

    private static final List<Integer> MILESTONE_DAYS = List.of(100, 365, 1000);

    private final NotificationRepository notificationRepository;
    private final PassportRepository passportRepository;
    private final DiagnosisRepository diagnosisRepository;
    private final Clock clock;
    private final int reminderThresholdDays;
    private final int reminderCooldownDays;

    public NotificationService(
            NotificationRepository notificationRepository,
            PassportRepository passportRepository,
            DiagnosisRepository diagnosisRepository,
            Clock clock,
            @org.springframework.beans.factory.annotation.Value("${notification.reminder-threshold-days}")
            int reminderThresholdDays,
            @org.springframework.beans.factory.annotation.Value("${notification.reminder-cooldown-days}")
            int reminderCooldownDays) {
        this.notificationRepository = notificationRepository;
        this.passportRepository = passportRepository;
        this.diagnosisRepository = diagnosisRepository;
        this.clock = clock;
        this.reminderThresholdDays = reminderThresholdDays;
        this.reminderCooldownDays = reminderCooldownDays;
    }

    public void evaluateAfterDiagnosis(Passport passport, Diagnosis diagnosis) {
        Map<String, Object> reasonFactors = buildReasonFactors(passport, diagnosis);
        Integer overallScore = averageScore(diagnosis);
        switch (diagnosis.getOverallGrade()) {
            case NEEDS_CARE -> create(passport.getId(), NotificationType.SELF_CARE, reasonFactors,
                "마모가 진행되고 있어요. 셀프케어 가이드를 확인해보세요.", overallScore);
            case URGENT -> create(passport.getId(), NotificationType.STORE_SERVICE, reasonFactors,
                "상태가 심각해요. 공식 서비스 예약을 고려해보세요.", overallScore);
            case GOOD -> {
            }
        }
    }

    private Integer averageScore(Diagnosis diagnosis) {
        return (int) Math.round(diagnosis.getItemScores().values().stream()
            .mapToInt(Integer::intValue).average().orElse(0));
    }

    public void generateReminders() {
        LocalDateTime now = LocalDateTime.now(clock);
        for (Passport passport : passportRepository.findAllByStatus(PassportStatus.ACTIVE)) {
            LocalDate lastActivity = diagnosisRepository
                .findFirstByPassportIdOrderByDiagnosedAtDesc(passport.getId())
                .map(Diagnosis::getDiagnosedAt)
                .map(LocalDateTime::toLocalDate)
                .orElse(passport.getPurchaseDate());
            long daysSince = ChronoUnit.DAYS.between(lastActivity, now.toLocalDate());
            if (daysSince > reminderThresholdDays) {
                LocalDateTime cooldownStart = now.minusDays(reminderCooldownDays);
                boolean alreadyReminded = notificationRepository.existsByPassportIdAndTypeAndCreatedAtAfter(
                    passport.getId(), NotificationType.SELF_CARE, cooldownStart);
                if (!alreadyReminded) {
                    create(passport.getId(), NotificationType.SELF_CARE,
                        Map.of("최근활동경과일", daysSince), "재진단할 시기가 지났어요. 마모 상태를 다시 확인해보세요.", null);
                }
            }
            long ownershipDaysSincePurchase = ChronoUnit.DAYS.between(passport.getPurchaseDate(), now.toLocalDate());
            if (MILESTONE_DAYS.contains((int) ownershipDaysSincePurchase)) {
                create(passport.getId(), NotificationType.MILESTONE,
                    Map.of("소유일수", ownershipDaysSincePurchase), ownershipDaysSincePurchase + "일째 함께하고 있어요!", null);
            }
        }
    }

    public Page<NotificationResponse> list(Long passportId, Long requesterAccountId, Pageable pageable) {
        assertOwnership(passportId, requesterAccountId);
        return notificationRepository.findAllByPassportIdOrderByCreatedAtDesc(passportId, pageable)
            .map(NotificationResponse::from);
    }

    public void markRead(Long notificationId, Long requesterAccountId) {
        Notification notification = getOwnedNotification(notificationId, requesterAccountId);
        notification.markRead();
    }

    public void markDismiss(Long notificationId, Long requesterAccountId) {
        Notification notification = getOwnedNotification(notificationId, requesterAccountId);
        notification.markDismissed();
    }

    private Notification getOwnedNotification(Long notificationId, Long requesterAccountId) {
        Notification notification = notificationRepository.findById(notificationId)
            .orElseThrow(() -> new ApiException(ErrorCode.NOTIFICATION_NOT_FOUND));
        assertOwnership(notification.getPassportId(), requesterAccountId);
        return notification;
    }

    private void assertOwnership(Long passportId, Long requesterAccountId) {
        Passport passport = passportRepository.findById(passportId)
            .orElseThrow(() -> new ApiException(ErrorCode.PASSPORT_NOT_FOUND));
        if (!passport.isOwnedBy(requesterAccountId)) {
            throw new ApiException(ErrorCode.FORBIDDEN);
        }
    }

    private Map<String, Object> buildReasonFactors(Passport passport, Diagnosis diagnosis) {
        long ownershipDays = ChronoUnit.DAYS.between(passport.getPurchaseDate(), LocalDate.now(clock));
        return Map.of(
            "마모도", diagnosis.getItemScores(),
            "사용빈도", passport.getUsageFrequency().name(),
            "계절", currentSeason(),
            "구매경과일", ownershipDays
        );
    }

    private String currentSeason() {
        int month = LocalDate.now(clock).getMonthValue();
        if (month >= 3 && month <= 5) return "봄";
        if (month >= 6 && month <= 8) return "여름";
        if (month >= 9 && month <= 11) return "가을";
        return "겨울";
    }

    private void create(Long passportId, NotificationType type, Map<String, Object> reasonFactors, String message,
                         Integer overallScore) {
        notificationRepository.save(new Notification(passportId, type, reasonFactors, message, overallScore));
    }
}
```

이 클래스는 `@Value`로 주입되는 두 개의 원시 타입(threshold/cooldown) 필드가 있어 Lombok `@RequiredArgsConstructor`로는 표현할 수 없다 — 그래서 Task 23/25에서 쓰던 `@RequiredArgsConstructor`를 걷어내고, 생성자 파라미터에 직접 `@Value`를 붙이는 단일 생성자로 전환했다. Task 23/25에서 작성한 메서드(`evaluateAfterDiagnosis`, `list`, `markRead`, `markDismiss`, `getOwnedNotification`, `assertOwnership`, `buildReasonFactors`, `currentSeason`, `create`)는 위 클래스 본문에 그대로 다시 포함되어 있다 — 이 파일 전체로 `NotificationService.java`를 덮어쓴다.

- [ ] **Step 4: 테스트 재실행해서 통과 확인**

Run: `./gradlew test --tests "com.mcm.passport.notification.NotificationServiceTest"`
Expected: PASS

- [ ] **Step 5: `ReminderScheduler` 작성**

```java
package com.mcm.passport.notification;

import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ReminderScheduler {

    private final NotificationService notificationService;

    @Scheduled(cron = "0 0 9 * * *")
    public void runDailyReminderCheck() {
        notificationService.generateReminders();
    }
}
```

- [ ] **Step 6: 메인 클래스에 `@EnableScheduling` 추가**

```java
package com.mcm.passport;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class PassportApplication {
    public static void main(String[] args) {
        SpringApplication.run(PassportApplication.class, args);
    }
}
```

- [ ] **Step 7: 컴파일 확인 후 커밋**

Run: `./gradlew compileJava compileTestJava`
Expected: BUILD SUCCESSFUL

```bash
git add src/main/java/com/mcm/passport/notification/ src/main/java/com/mcm/passport/PassportApplication.java src/test/java/com/mcm/passport/notification/NotificationServiceTest.java
git commit -m "feat: add daily re-diagnosis reminder scheduler"
```

---

## Task 27: 케어 기록 저장 (POST, GET /api/passports/{id}/care-records, GET /api/care-records/{id})

**Files:**
- Create: `src/main/resources/db/migration/V5__create_care_record_table.sql`
- Create: `src/main/java/com/mcm/passport/care/CareRecord.java`
- Create: `src/main/java/com/mcm/passport/care/CareRecordRepository.java`
- Create: `src/main/java/com/mcm/passport/care/dto/CreateCareRecordRequest.java`
- Create: `src/main/java/com/mcm/passport/care/dto/CareRecordResponse.java`
- Create: `src/main/java/com/mcm/passport/care/CareRecordService.java`
- Create: `src/main/java/com/mcm/passport/care/CareRecordController.java`
- Test: `src/test/java/com/mcm/passport/care/CareRecordServiceTest.java`

**Interfaces:**
- Produces: `CareRecordService.create(Long passportId, Long requesterAccountId, CreateCareRecordRequest, MultipartFile image): CareRecordResponse`, `list(...)`, `getDetail(...)`

- [ ] **Step 1: Flyway 마이그레이션 작성**

```sql
-- V5__create_care_record_table.sql
CREATE TABLE care_record (
    id BIGSERIAL PRIMARY KEY,
    passport_id BIGINT NOT NULL REFERENCES passport(id),
    care_type VARCHAR(100) NOT NULL,
    material_type VARCHAR(100),
    notes VARCHAR(1000),
    image_url VARCHAR(500),
    completed_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);
```

- [ ] **Step 2: `CareRecord` 엔티티 작성**

```java
package com.mcm.passport.care;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "care_record")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CareRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "passport_id", nullable = false)
    private Long passportId;

    @Column(name = "care_type", nullable = false)
    private String careType;

    @Column(name = "material_type")
    private String materialType;

    @Column(length = 1000)
    private String notes;

    @Column(name = "image_url")
    private String imageUrl;

    @Column(name = "completed_at", nullable = false)
    private LocalDateTime completedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public CareRecord(Long passportId, String careType, String materialType, String notes,
                       String imageUrl, LocalDateTime completedAt) {
        this.passportId = passportId;
        this.careType = careType;
        this.materialType = materialType;
        this.notes = notes;
        this.imageUrl = imageUrl;
        this.completedAt = completedAt;
    }

    @PrePersist
    void prePersist() {
        this.createdAt = LocalDateTime.now();
        if (this.completedAt == null) {
            this.completedAt = this.createdAt;
        }
    }
}
```

- [ ] **Step 3: 리포지토리, DTO 작성**

```java
package com.mcm.passport.care;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CareRecordRepository extends JpaRepository<CareRecord, Long> {
    Page<CareRecord> findAllByPassportIdOrderByCompletedAtDesc(Long passportId, Pageable pageable);
    List<CareRecord> findAllByPassportId(Long passportId);
}
```

```java
package com.mcm.passport.care.dto;

import jakarta.validation.constraints.NotBlank;

import java.time.LocalDateTime;

public record CreateCareRecordRequest(
    @NotBlank String careType, String materialType, String notes, LocalDateTime completedAt
) {
}
```

```java
package com.mcm.passport.care.dto;

import com.mcm.passport.care.CareRecord;

import java.time.LocalDateTime;

public record CareRecordResponse(
    Long id, String careType, String materialType, String notes, String imageUrl, LocalDateTime completedAt
) {
    public static CareRecordResponse from(CareRecord record) {
        return new CareRecordResponse(record.getId(), record.getCareType(), record.getMaterialType(),
            record.getNotes(), record.getImageUrl(), record.getCompletedAt());
    }
}
```

- [ ] **Step 4: 실패하는 서비스 테스트 작성**

```java
package com.mcm.passport.care;

import com.mcm.passport.care.dto.CareRecordResponse;
import com.mcm.passport.care.dto.CreateCareRecordRequest;
import com.mcm.passport.common.exception.ApiException;
import com.mcm.passport.common.exception.ErrorCode;
import com.mcm.passport.common.storage.ImageStorageService;
import com.mcm.passport.passport.Passport;
import com.mcm.passport.passport.PassportRepository;
import com.mcm.passport.passport.UsageFrequency;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class CareRecordServiceTest {

    @Mock private CareRecordRepository careRecordRepository;
    @Mock private PassportRepository passportRepository;
    @Mock private ImageStorageService imageStorageService;

    private CareRecordService careRecordService;

    @Test
    void createRejectsNonOwner() {
        careRecordService = new CareRecordService(careRecordRepository, passportRepository, imageStorageService);
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.DAILY);
        when(passportRepository.findById(1L)).thenReturn(Optional.of(passport));

        assertThatThrownBy(() -> careRecordService.create(1L, 999L,
                new CreateCareRecordRequest("가죽 크림 도포", "가죽", "메모", null), null))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.FORBIDDEN);
    }

    @Test
    void createSavesCareRecordWithUploadedImage() {
        careRecordService = new CareRecordService(careRecordRepository, passportRepository, imageStorageService);
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.DAILY);
        when(passportRepository.findById(1L)).thenReturn(Optional.of(passport));
        when(careRecordRepository.save(any(CareRecord.class))).thenAnswer(inv -> inv.getArgument(0));

        CareRecordResponse response = careRecordService.create(1L, 1L,
            new CreateCareRecordRequest("가죽 크림 도포", "가죽", "메모", null), null);

        assertThat(response.careType()).isEqualTo("가죽 크림 도포");
    }
}
```

- [ ] **Step 5: 테스트 실행해서 실패 확인**

Run: `./gradlew test --tests "com.mcm.passport.care.CareRecordServiceTest"`
Expected: FAIL — `CareRecordService` 클래스 없음

- [ ] **Step 6: `CareRecordService` 구현**

```java
package com.mcm.passport.care;

import com.mcm.passport.care.dto.CareRecordResponse;
import com.mcm.passport.care.dto.CreateCareRecordRequest;
import com.mcm.passport.common.exception.ApiException;
import com.mcm.passport.common.exception.ErrorCode;
import com.mcm.passport.common.storage.ImageStorageService;
import com.mcm.passport.passport.Passport;
import com.mcm.passport.passport.PassportRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
@RequiredArgsConstructor
@Transactional
public class CareRecordService {

    private final CareRecordRepository careRecordRepository;
    private final PassportRepository passportRepository;
    private final ImageStorageService imageStorageService;

    public CareRecordResponse create(Long passportId, Long requesterAccountId,
                                      CreateCareRecordRequest request, MultipartFile image) {
        Passport passport = getOwnedPassport(passportId, requesterAccountId);
        String imageUrl = image != null && !image.isEmpty() ? imageStorageService.upload(image) : null;
        CareRecord record = new CareRecord(passport.getId(), request.careType(), request.materialType(),
            request.notes(), imageUrl, request.completedAt());
        return CareRecordResponse.from(careRecordRepository.save(record));
    }

    public Page<CareRecordResponse> list(Long passportId, Long requesterAccountId, Pageable pageable) {
        getOwnedPassport(passportId, requesterAccountId);
        return careRecordRepository.findAllByPassportIdOrderByCompletedAtDesc(passportId, pageable)
            .map(CareRecordResponse::from);
    }

    public CareRecordResponse getDetail(Long careRecordId, Long requesterAccountId) {
        CareRecord record = careRecordRepository.findById(careRecordId)
            .orElseThrow(() -> new ApiException(ErrorCode.CARE_RECORD_NOT_FOUND));
        getOwnedPassport(record.getPassportId(), requesterAccountId);
        return CareRecordResponse.from(record);
    }

    private Passport getOwnedPassport(Long passportId, Long requesterAccountId) {
        Passport passport = passportRepository.findById(passportId)
            .orElseThrow(() -> new ApiException(ErrorCode.PASSPORT_NOT_FOUND));
        if (!passport.isOwnedBy(requesterAccountId)) {
            throw new ApiException(ErrorCode.FORBIDDEN);
        }
        return passport;
    }
}
```

- [ ] **Step 7: 테스트 재실행해서 통과 확인**

Run: `./gradlew test --tests "com.mcm.passport.care.CareRecordServiceTest"`
Expected: PASS

- [ ] **Step 8: 컨트롤러 작성**

```java
package com.mcm.passport.care;

import com.mcm.passport.care.dto.CareRecordResponse;
import com.mcm.passport.care.dto.CreateCareRecordRequest;
import com.mcm.passport.common.security.CurrentAccount;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequiredArgsConstructor
public class CareRecordController {

    private final CareRecordService careRecordService;

    @PostMapping(value = "/api/passports/{passportId}/care-records", consumes = "multipart/form-data")
    public ResponseEntity<CareRecordResponse> create(
            Authentication authentication, @PathVariable Long passportId,
            @RequestPart("request") CreateCareRecordRequest request,
            @RequestPart(value = "image", required = false) MultipartFile image) {
        CareRecordResponse response = careRecordService.create(
            passportId, CurrentAccount.id(authentication), request, image);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping("/api/passports/{passportId}/care-records")
    public ResponseEntity<Page<CareRecordResponse>> list(
            Authentication authentication, @PathVariable Long passportId,
            @PageableDefault(size = 20) Pageable pageable) {
        return ResponseEntity.ok(
            careRecordService.list(passportId, CurrentAccount.id(authentication), pageable));
    }

    @GetMapping("/api/care-records/{id}")
    public ResponseEntity<CareRecordResponse> getDetail(Authentication authentication, @PathVariable Long id) {
        return ResponseEntity.ok(careRecordService.getDetail(id, CurrentAccount.id(authentication)));
    }
}
```

- [ ] **Step 9: 컴파일 확인 후 커밋**

Run: `./gradlew compileJava compileTestJava`
Expected: BUILD SUCCESSFUL

```bash
git add src/main/resources/db/migration/V5__create_care_record_table.sql src/main/java/com/mcm/passport/care/ src/test/java/com/mcm/passport/care/
git commit -m "feat: add care record endpoints"
```

---

## Task 28: 사용자 직접 타임라인 이벤트 (POST /api/passports/{id}/timeline/events, GET /api/timeline/events/{id})

**Files:**
- Create: `src/main/resources/db/migration/V6__create_timeline_event_table.sql`
- Create: `src/main/java/com/mcm/passport/timeline/TimelineEventType.java`
- Create: `src/main/java/com/mcm/passport/timeline/TimelineEvent.java`
- Create: `src/main/java/com/mcm/passport/timeline/TimelineEventRepository.java`
- Create: `src/main/java/com/mcm/passport/timeline/dto/CreateTimelineEventRequest.java`
- Create: `src/main/java/com/mcm/passport/timeline/dto/TimelineEventResponse.java`
- Create: `src/main/java/com/mcm/passport/timeline/TimelineService.java` (이 태스크에서는 `createEvent`, `getEventDetail`만 — 통합 타임라인 조회는 Task 29)
- Create: `src/main/java/com/mcm/passport/timeline/TimelineController.java` (이 태스크에서는 이벤트 생성/상세만)
- Test: `src/test/java/com/mcm/passport/timeline/TimelineServiceTest.java`

**Interfaces:**
- Produces: `TimelineService.createEvent(Long passportId, Long requesterAccountId, CreateTimelineEventRequest, MultipartFile image): TimelineEventResponse`, `getEventDetail(Long eventId, Long requesterAccountId): TimelineEventResponse`

> **2026-08-11 재기획 변경사항:** 와이어프레임에 있던 기록유형(순간기록/매장방문/셀프케어/기타) 필드가 이번 MVP 범위로 승격됨. `TimelineEventType` enum(`MOMENT`/`STORE_VISIT`/`SELF_CARE`/`OTHER`)을 신설하고 `TimelineEvent.eventType`(NOT NULL, 기본값 `MOMENT`)으로 저장한다. 사용자가 값을 안 보내면 `MOMENT`로 기본 처리.

- [ ] **Step 1: Flyway 마이그레이션 작성**

```sql
-- V6__create_timeline_event_table.sql
CREATE TABLE timeline_event (
    id BIGSERIAL PRIMARY KEY,
    passport_id BIGINT NOT NULL REFERENCES passport(id),
    event_type VARCHAR(30) NOT NULL DEFAULT 'MOMENT',
    note VARCHAR(1000),
    image_url VARCHAR(500),
    event_date TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);
```

- [ ] **Step 2: `TimelineEventType` enum, `TimelineEvent` 엔티티 작성**

```java
package com.mcm.passport.timeline;

public enum TimelineEventType {
    MOMENT, STORE_VISIT, SELF_CARE, OTHER
}
```

```java
package com.mcm.passport.timeline;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "timeline_event")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class TimelineEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "passport_id", nullable = false)
    private Long passportId;

    @Enumerated(EnumType.STRING)
    @Column(name = "event_type", nullable = false)
    private TimelineEventType eventType;

    @Column(length = 1000)
    private String note;

    @Column(name = "image_url")
    private String imageUrl;

    @Column(name = "event_date", nullable = false)
    private LocalDateTime eventDate;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public TimelineEvent(Long passportId, TimelineEventType eventType, String note, String imageUrl,
                          LocalDateTime eventDate) {
        this.passportId = passportId;
        this.eventType = eventType != null ? eventType : TimelineEventType.MOMENT;
        this.note = note;
        this.imageUrl = imageUrl;
        this.eventDate = eventDate;
    }

    @PrePersist
    void prePersist() {
        this.createdAt = LocalDateTime.now();
        if (this.eventDate == null) {
            this.eventDate = this.createdAt;
        }
    }
}
```

- [ ] **Step 3: 리포지토리, DTO 작성**

```java
package com.mcm.passport.timeline;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TimelineEventRepository extends JpaRepository<TimelineEvent, Long> {
    List<TimelineEvent> findAllByPassportId(Long passportId);
}
```

```java
package com.mcm.passport.timeline.dto;

import com.mcm.passport.timeline.TimelineEventType;

import java.time.LocalDateTime;

public record CreateTimelineEventRequest(TimelineEventType eventType, String note, LocalDateTime eventDate) {
}
```

```java
package com.mcm.passport.timeline.dto;

import com.mcm.passport.timeline.TimelineEvent;
import com.mcm.passport.timeline.TimelineEventType;

import java.time.LocalDateTime;

public record TimelineEventResponse(
    Long id, TimelineEventType eventType, String note, String imageUrl, LocalDateTime eventDate
) {
    public static TimelineEventResponse from(TimelineEvent event) {
        return new TimelineEventResponse(
            event.getId(), event.getEventType(), event.getNote(), event.getImageUrl(), event.getEventDate());
    }
}
```

- [ ] **Step 4: 실패하는 서비스 테스트 작성**

```java
package com.mcm.passport.timeline;

import com.mcm.passport.care.CareRecordRepository;
import com.mcm.passport.common.exception.ApiException;
import com.mcm.passport.common.exception.ErrorCode;
import com.mcm.passport.common.storage.ImageStorageService;
import com.mcm.passport.diagnosis.DiagnosisRepository;
import com.mcm.passport.notification.NotificationRepository;
import com.mcm.passport.passport.Passport;
import com.mcm.passport.passport.PassportRepository;
import com.mcm.passport.passport.UsageFrequency;
import com.mcm.passport.timeline.dto.CreateTimelineEventRequest;
import com.mcm.passport.timeline.dto.TimelineEventResponse;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class TimelineServiceTest {

    @Mock private TimelineEventRepository timelineEventRepository;
    @Mock private PassportRepository passportRepository;
    @Mock private DiagnosisRepository diagnosisRepository;
    @Mock private CareRecordRepository careRecordRepository;
    @Mock private NotificationRepository notificationRepository;
    @Mock private ImageStorageService imageStorageService;

    private TimelineService timelineService;

    @Test
    void createEventRejectsNonOwner() {
        timelineService = newService();
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.DAILY);
        when(passportRepository.findById(1L)).thenReturn(Optional.of(passport));

        assertThatThrownBy(() -> timelineService.createEvent(1L, 999L,
                new CreateTimelineEventRequest(TimelineEventType.MOMENT, "첫 여행", null), null))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.FORBIDDEN);
    }

    @Test
    void createEventSavesNoteAndImage() {
        timelineService = newService();
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.DAILY);
        when(passportRepository.findById(1L)).thenReturn(Optional.of(passport));
        when(timelineEventRepository.save(any(TimelineEvent.class))).thenAnswer(inv -> inv.getArgument(0));

        TimelineEventResponse response = timelineService.createEvent(1L, 1L,
            new CreateTimelineEventRequest(TimelineEventType.MOMENT, "첫 여행", null), null);

        assertThat(response.note()).isEqualTo("첫 여행");
    }

    private TimelineService newService() {
        return new TimelineService(timelineEventRepository, passportRepository, diagnosisRepository,
            careRecordRepository, notificationRepository, imageStorageService);
    }
}
```

- [ ] **Step 5: 테스트 실행해서 실패 확인**

Run: `./gradlew test --tests "com.mcm.passport.timeline.TimelineServiceTest"`
Expected: FAIL — `TimelineService` 클래스 없음

- [ ] **Step 6: `TimelineService`에 이벤트 생성/상세 메서드 구현 (통합 조회는 Task 29에서 추가)**

```java
package com.mcm.passport.timeline;

import com.mcm.passport.care.CareRecordRepository;
import com.mcm.passport.common.exception.ApiException;
import com.mcm.passport.common.exception.ErrorCode;
import com.mcm.passport.common.storage.ImageStorageService;
import com.mcm.passport.diagnosis.DiagnosisRepository;
import com.mcm.passport.notification.NotificationRepository;
import com.mcm.passport.passport.Passport;
import com.mcm.passport.passport.PassportRepository;
import com.mcm.passport.timeline.dto.CreateTimelineEventRequest;
import com.mcm.passport.timeline.dto.TimelineEventResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
@RequiredArgsConstructor
@Transactional
public class TimelineService {

    private final TimelineEventRepository timelineEventRepository;
    private final PassportRepository passportRepository;
    private final DiagnosisRepository diagnosisRepository;
    private final CareRecordRepository careRecordRepository;
    private final NotificationRepository notificationRepository;
    private final ImageStorageService imageStorageService;

    public TimelineEventResponse createEvent(Long passportId, Long requesterAccountId,
                                              CreateTimelineEventRequest request, MultipartFile image) {
        Passport passport = getOwnedPassport(passportId, requesterAccountId);
        String imageUrl = image != null && !image.isEmpty() ? imageStorageService.upload(image) : null;
        TimelineEvent event = new TimelineEvent(
            passport.getId(), request.eventType(), request.note(), imageUrl, request.eventDate());
        return TimelineEventResponse.from(timelineEventRepository.save(event));
    }

    public TimelineEventResponse getEventDetail(Long eventId, Long requesterAccountId) {
        TimelineEvent event = timelineEventRepository.findById(eventId)
            .orElseThrow(() -> new ApiException(ErrorCode.TIMELINE_EVENT_NOT_FOUND));
        getOwnedPassport(event.getPassportId(), requesterAccountId);
        return TimelineEventResponse.from(event);
    }

    private Passport getOwnedPassport(Long passportId, Long requesterAccountId) {
        Passport passport = passportRepository.findById(passportId)
            .orElseThrow(() -> new ApiException(ErrorCode.PASSPORT_NOT_FOUND));
        if (!passport.isOwnedBy(requesterAccountId)) {
            throw new ApiException(ErrorCode.FORBIDDEN);
        }
        return passport;
    }
}
```

- [ ] **Step 7: 테스트 재실행해서 통과 확인**

Run: `./gradlew test --tests "com.mcm.passport.timeline.TimelineServiceTest"`
Expected: PASS

- [ ] **Step 8: 컨트롤러 작성 (이벤트 생성/상세만)**

```java
package com.mcm.passport.timeline;

import com.mcm.passport.common.security.CurrentAccount;
import com.mcm.passport.timeline.dto.CreateTimelineEventRequest;
import com.mcm.passport.timeline.dto.TimelineEventResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequiredArgsConstructor
public class TimelineController {

    private final TimelineService timelineService;

    @PostMapping(value = "/api/passports/{passportId}/timeline/events", consumes = "multipart/form-data")
    public ResponseEntity<TimelineEventResponse> createEvent(
            Authentication authentication, @PathVariable Long passportId,
            @RequestPart("request") CreateTimelineEventRequest request,
            @RequestPart(value = "image", required = false) MultipartFile image) {
        TimelineEventResponse response = timelineService.createEvent(
            passportId, CurrentAccount.id(authentication), request, image);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping("/api/timeline/events/{id}")
    public ResponseEntity<TimelineEventResponse> getEventDetail(Authentication authentication, @PathVariable Long id) {
        return ResponseEntity.ok(timelineService.getEventDetail(id, CurrentAccount.id(authentication)));
    }
}
```

- [ ] **Step 9: 컴파일 확인 후 커밋**

Run: `./gradlew compileJava compileTestJava`
Expected: BUILD SUCCESSFUL

```bash
git add src/main/resources/db/migration/V6__create_timeline_event_table.sql src/main/java/com/mcm/passport/timeline/ src/test/java/com/mcm/passport/timeline/TimelineServiceTest.java
git commit -m "feat: add user-added timeline event endpoints"
```

---

## Task 29: 통합 타임라인 조회 (GET /api/passports/{id}/timeline)

**Files:**
- Create: `src/main/java/com/mcm/passport/timeline/dto/TimelineItem.java`
- Modify: `src/main/java/com/mcm/passport/timeline/TimelineService.java` (`getTimeline` 추가)
- Modify: `src/main/java/com/mcm/passport/timeline/TimelineController.java` (엔드포인트 추가)
- Test: `src/test/java/com/mcm/passport/timeline/TimelineServiceTest.java` (테스트 추가)

**Interfaces:**
- Produces: `TimelineService.getTimeline(Long passportId, Long requesterAccountId): List<TimelineItem>` — 여권 생성 + 진단 + 케어 + 읽은 알림 + 사용자 이벤트를 시간순으로 합친 목록. **참고:** 이 엔드포인트는 페이지네이션하지 않는다 — 여권 1개당 이력이 데모/실사용 규모에서 충분히 작다고 판단했기 때문 (스펙의 일반적인 목록 API 페이지네이션 원칙과 다른 의도적 단순화).

- [ ] **Step 1: `TimelineItem` 작성**

```java
package com.mcm.passport.timeline.dto;

import java.time.LocalDateTime;
import java.util.Map;

public record TimelineItem(String type, Long id, LocalDateTime occurredAt, Map<String, Object> detail) {
}
```

- [ ] **Step 2: 실패하는 테스트 추가**

```java
    @Test
    void getTimelineReturnsItemsSortedByDate() {
        timelineService = newService();
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.DAILY);
        when(passportRepository.findById(1L)).thenReturn(Optional.of(passport));
        when(diagnosisRepository.findAllByPassportId(1L)).thenReturn(List.of());
        when(careRecordRepository.findAllByPassportId(1L)).thenReturn(List.of());
        when(notificationRepository.findAllByPassportIdAndReadTrue(1L)).thenReturn(List.of());
        when(timelineEventRepository.findAllByPassportId(1L)).thenReturn(List.of());

        var items = timelineService.getTimeline(1L, 1L);

        assertThat(items).hasSize(1); // 등록(REGISTRATION) 이벤트 1개만 존재
        assertThat(items.get(0).type()).isEqualTo("REGISTRATION");
    }
```

- [ ] **Step 3: 테스트 실행해서 실패 확인**

Run: `./gradlew test --tests "com.mcm.passport.timeline.TimelineServiceTest"`
Expected: FAIL — `getTimeline` 메서드 없음, `Passport.getCreatedAt()`은 이미 존재하지만 `findAll*` 메서드들의 반환 타입이 `List`인지 확인 필요 (이미 Task 20/27/22/28에서 `findAllByPassportId` 시그니처로 만들어둠)

- [ ] **Step 4: `TimelineService`에 `getTimeline` 추가**

```java
    public java.util.List<com.mcm.passport.timeline.dto.TimelineItem> getTimeline(
            Long passportId, Long requesterAccountId) {
        Passport passport = getOwnedPassport(passportId, requesterAccountId);

        java.util.List<com.mcm.passport.timeline.dto.TimelineItem> items = new java.util.ArrayList<>();

        items.add(new com.mcm.passport.timeline.dto.TimelineItem(
            "REGISTRATION", passport.getId(), passport.getCreatedAt(),
            java.util.Map.of("modelName", passport.getModelName())));

        diagnosisRepository.findAllByPassportId(passportId).forEach(d ->
            items.add(new com.mcm.passport.timeline.dto.TimelineItem("DIAGNOSIS", d.getId(), d.getDiagnosedAt(),
                java.util.Map.of("overallGrade", d.getOverallGrade().name(), "diagnosisType", d.getDiagnosisType().name()))));

        careRecordRepository.findAllByPassportId(passportId).forEach(c ->
            items.add(new com.mcm.passport.timeline.dto.TimelineItem("CARE", c.getId(), c.getCompletedAt(),
                java.util.Map.of("careType", c.getCareType()))));

        notificationRepository.findAllByPassportIdAndReadTrue(passportId).forEach(n ->
            items.add(new com.mcm.passport.timeline.dto.TimelineItem("NOTIFICATION", n.getId(), n.getCreatedAt(),
                java.util.Map.of("type", n.getType().name(), "message", n.getMessage()))));

        timelineEventRepository.findAllByPassportId(passportId).forEach(e ->
            items.add(new com.mcm.passport.timeline.dto.TimelineItem("USER_EVENT", e.getId(), e.getEventDate(),
                java.util.Map.of(
                    "eventType", e.getEventType().name(),
                    "note", e.getNote() != null ? e.getNote() : ""))));

        items.sort(java.util.Comparator.comparing(com.mcm.passport.timeline.dto.TimelineItem::occurredAt));
        return items;
    }
```

- [ ] **Step 5: 테스트 재실행해서 통과 확인**

Run: `./gradlew test --tests "com.mcm.passport.timeline.TimelineServiceTest"`
Expected: PASS

- [ ] **Step 6: 컨트롤러에 엔드포인트 추가**

```java
    @GetMapping("/api/passports/{passportId}/timeline")
    public ResponseEntity<java.util.List<com.mcm.passport.timeline.dto.TimelineItem>> getTimeline(
            Authentication authentication, @PathVariable Long passportId) {
        return ResponseEntity.ok(timelineService.getTimeline(passportId, CurrentAccount.id(authentication)));
    }
```

- [ ] **Step 7: 컴파일 확인 후 커밋**

Run: `./gradlew compileJava compileTestJava`
Expected: BUILD SUCCESSFUL

```bash
git add src/main/java/com/mcm/passport/timeline/ src/test/java/com/mcm/passport/timeline/TimelineServiceTest.java
git commit -m "feat: add combined passport timeline endpoint"
```

---

## Task 30: 엔드투엔드 회귀 테스트 (등록 → 진단 → 알림 → 타임라인)

**Files:**
- Test: `src/test/java/com/mcm/passport/EndToEndFlowTest.java`

**Interfaces:**
- Consumes: 모든 이전 태스크의 컨트롤러 엔드포인트

- [ ] **Step 1: 시나리오 테스트 작성**

```java
package com.mcm.passport;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mcm.passport.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class EndToEndFlowTest extends AbstractIntegrationTest {

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void fullFlowFromSignupToTimeline() throws Exception {
        // 1. 회원가입
        String signupJson = """
            {"email":"e2e@example.com","password":"password123","nickname":"E2E유저"}
            """;
        mockMvc.perform(post("/api/auth/signup").contentType("application/json").content(signupJson))
            .andExpect(status().isCreated());

        // 2. 로그인
        String loginJson = """
            {"email":"e2e@example.com","password":"password123"}
            """;
        String loginResponse = mockMvc.perform(post("/api/auth/login").contentType("application/json").content(loginJson))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        String token = objectMapper.readTree(loginResponse).get("accessToken").asText();

        // 3. 여권 등록
        MockMultipartFile requestPart = new MockMultipartFile("request", "", "application/json",
            """
            {"serialNumber":"E1234","modelName":"Nomad Backpack","purchaseDate":"2024-01-01","usageFrequency":"DAILY"}
            """.getBytes());
        String registerResponse = mockMvc.perform(multipart("/api/passports")
                .file(requestPart)
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        long passportId = objectMapper.readTree(registerResponse).get("id").asLong();

        // 4. 마모 진단 제출 (URGENT 등급이 나오도록 previous 없이 시작 — 규칙기반은 항상 GOOD로 시작하므로,
        //    이 테스트에서는 등급과 무관하게 진단 자체가 성공하고 타임라인에 반영되는지만 확인한다)
        MockMultipartFile imagePart = new MockMultipartFile("images", "photo.jpg", "image/jpeg", "fake-image".getBytes());
        mockMvc.perform(multipart("/api/passports/" + passportId + "/diagnoses")
                .file(imagePart)
                .param("diagnosisType", "SELF")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.overallGrade").value("GOOD"));

        // 5. 타임라인 조회 — 등록 이벤트 + 진단 이벤트가 모두 보이는지 확인
        mockMvc.perform(get("/api/passports/" + passportId + "/timeline")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[?(@.type == 'REGISTRATION')]").exists())
            .andExpect(jsonPath("$[?(@.type == 'DIAGNOSIS')]").exists());
    }
}
```

**주의:** 이미지 업로드 단계에서 실제 Cloudinary 호출이 일어나면 이 테스트는 외부 네트워크에 의존하게 되어 CI에서 불안정해진다. 이 태스크를 실행할 때는 `@TestConfiguration`으로 `ImageStorageService`를 테스트 전용 빈(예: 항상 `"https://fake-cdn/test.jpg"`를 반환하는 스텁)으로 오버라이드해서, 실제 Cloudinary에 네트워크 요청이 나가지 않도록 만든다. 예:

```java
package com.mcm.passport.support;

import com.mcm.passport.common.storage.ImageStorageService;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

@TestConfiguration
public class FakeImageStorageConfig {

    @Bean
    @Primary
    public ImageStorageService fakeImageStorageService() {
        return file -> "https://fake-cdn.test/" + file.getOriginalFilename();
    }
}
```

`EndToEndFlowTest`에 `@Import(FakeImageStorageConfig.class)`를 추가해서 이 스텁이 실제 `CloudinaryImageStorageService` 대신 주입되게 한다.

- [ ] **Step 2: 테스트 실행 (Docker 필요)**

Run: `./gradlew test --tests "com.mcm.passport.EndToEndFlowTest"`
Expected: PASS

- [ ] **Step 3: 전체 테스트 스위트 실행해서 회귀 없는지 최종 확인**

Run: `./gradlew test`
Expected: BUILD SUCCESSFUL (모든 태스크의 테스트가 함께 통과)

- [ ] **Step 4: 커밋**

```bash
git add src/test/java/com/mcm/passport/EndToEndFlowTest.java src/test/java/com/mcm/passport/support/FakeImageStorageConfig.java
git commit -m "test: add end-to-end regression test for core registration-to-timeline flow"
```

---

## Task 31: TransferCode 스키마 + 엔티티 + 리포지토리

> **2026-08-11 재기획 추가:** 2차 멘토링 기획서(그림1 "360° Nomad Journey")에서 여권 승계(소유권 이전)가 메인 순환 흐름으로 편입됨에 따라, 이번 스프린트 범위로 새로 추가하는 도메인. `MCM_Nomad_Passport_백엔드_신규구현사항.md` 1절 기준.

**Files:**
- Create: `src/main/resources/db/migration/V7__create_transfer_code_table.sql`
- Create: `src/main/java/com/mcm/passport/transfer/TransferStatus.java`
- Create: `src/main/java/com/mcm/passport/transfer/TransferCode.java`
- Create: `src/main/java/com/mcm/passport/transfer/TransferCodeRepository.java`
- Test: `src/test/java/com/mcm/passport/transfer/TransferCodeRepositoryTest.java`

**Interfaces:**
- Produces: `TransferCode(Long passportId, String code, Long issuedByAccountId, LocalDateTime expiresAt)`, `transferCode.redeem(Long redeemedByAccountId)`, `transferCode.expire()`, `transferCode.isRedeemable(LocalDateTime now)`.

- [ ] **Step 1: Flyway 마이그레이션 작성**

```sql
-- V7__create_transfer_code_table.sql
CREATE TABLE transfer_code (
    id BIGSERIAL PRIMARY KEY,
    passport_id BIGINT NOT NULL REFERENCES passport(id),
    code VARCHAR(6) NOT NULL UNIQUE,
    issued_by_account_id BIGINT NOT NULL REFERENCES account(id),
    status VARCHAR(20) NOT NULL,
    redeemed_by_account_id BIGINT REFERENCES account(id),
    redeemed_at TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);
```

- [ ] **Step 2: enum 작성**

```java
package com.mcm.passport.transfer;

public enum TransferStatus {
    ISSUED, REDEEMED, EXPIRED
}
```

- [ ] **Step 3: `TransferCode` 엔티티 작성**

```java
package com.mcm.passport.transfer;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "transfer_code")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class TransferCode {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "passport_id", nullable = false)
    private Long passportId;

    @Column(nullable = false, unique = true, length = 6)
    private String code;

    @Column(name = "issued_by_account_id", nullable = false)
    private Long issuedByAccountId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private TransferStatus status;

    @Column(name = "redeemed_by_account_id")
    private Long redeemedByAccountId;

    @Column(name = "redeemed_at")
    private LocalDateTime redeemedAt;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public TransferCode(Long passportId, String code, Long issuedByAccountId, LocalDateTime expiresAt) {
        this.passportId = passportId;
        this.code = code;
        this.issuedByAccountId = issuedByAccountId;
        this.status = TransferStatus.ISSUED;
        this.expiresAt = expiresAt;
    }

    @PrePersist
    void prePersist() {
        this.createdAt = LocalDateTime.now();
    }

    public boolean isRedeemable(LocalDateTime now) {
        return this.status == TransferStatus.ISSUED && now.isBefore(this.expiresAt);
    }

    public void redeem(Long redeemedByAccountId) {
        this.status = TransferStatus.REDEEMED;
        this.redeemedByAccountId = redeemedByAccountId;
        this.redeemedAt = LocalDateTime.now();
    }

    public void expire() {
        this.status = TransferStatus.EXPIRED;
    }
}
```

- [ ] **Step 4: 리포지토리 작성**

```java
package com.mcm.passport.transfer;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface TransferCodeRepository extends JpaRepository<TransferCode, Long> {
    Optional<TransferCode> findByCode(String code);
    List<TransferCode> findAllByPassportIdAndStatus(Long passportId, TransferStatus status);
}
```

- [ ] **Step 5: 통합 테스트 작성**

```java
package com.mcm.passport.transfer;

import com.mcm.passport.account.Account;
import com.mcm.passport.account.AccountRepository;
import com.mcm.passport.passport.Passport;
import com.mcm.passport.passport.PassportRepository;
import com.mcm.passport.passport.UsageFrequency;
import com.mcm.passport.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class TransferCodeRepositoryTest extends AbstractIntegrationTest {

    @Autowired private TransferCodeRepository transferCodeRepository;
    @Autowired private PassportRepository passportRepository;
    @Autowired private AccountRepository accountRepository;

    @Test
    void savesAndFindsByCode() {
        Account owner = accountRepository.save(new Account("owner@test.com", "hash", "닉네임"));
        Passport passport = passportRepository.save(new Passport("A1234", 2024, owner.getId(),
            "Nomad Backpack", "애칭", LocalDate.of(2024, 1, 1), "MCM 강남점", null, false,
            List.of(), UsageFrequency.DAILY));
        transferCodeRepository.save(new TransferCode(
            passport.getId(), "AB12CD", owner.getId(), LocalDateTime.now().plusDays(7)));

        var found = transferCodeRepository.findByCode("AB12CD");

        assertThat(found).isPresent();
        assertThat(found.get().getStatus()).isEqualTo(TransferStatus.ISSUED);
        List<TransferCode> issued = transferCodeRepository.findAllByPassportIdAndStatus(
            passport.getId(), TransferStatus.ISSUED);
        assertThat(issued).hasSize(1);
    }
}
```

(`Account` 생성자 시그니처는 Task 4에서 확정된 그대로 사용 — 실제 필드 순서가 다르면 기존 `AccountRepositoryTest`의 패턴을 그대로 따른다.)

- [ ] **Step 6: 테스트 실행 (Docker 필요)**

Run: `./gradlew test --tests "com.mcm.passport.transfer.TransferCodeRepositoryTest"`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add src/main/resources/db/migration/V7__create_transfer_code_table.sql src/main/java/com/mcm/passport/transfer/ src/test/java/com/mcm/passport/transfer/TransferCodeRepositoryTest.java
git commit -m "feat: add TransferCode entity"
```

---

## Task 32: 승계 코드 발급 API (POST /api/passports/{id}/transfer-code)

**Files:**
- Modify: `src/main/java/com/mcm/passport/common/exception/ErrorCode.java` (3개 신규 코드 추가)
- Create: `src/main/java/com/mcm/passport/transfer/dto/TransferCodeResponse.java`
- Create: `src/main/java/com/mcm/passport/transfer/TransferService.java` (이 태스크에서는 `issueCode`만 — 미리보기/실행은 Task 33/34)
- Create: `src/main/java/com/mcm/passport/transfer/TransferController.java` (이 태스크에서는 발급 엔드포인트만)
- Test: `src/test/java/com/mcm/passport/transfer/TransferServiceTest.java`

**Interfaces:**
- Produces: `TransferService.issueCode(Long passportId, Long requesterAccountId): TransferCodeResponse`

> **범위 축소 결정 (2026-08-11):** 와이어프레임 기반 분석(`백엔드_신규구현사항.md`)에 "코드 재입력 불일치(발급 시)" 에러 케이스가 있었으나, 서버가 생성하는 코드를 발급 즉시 사용자가 재입력해 서버로 확인받는 왕복 절차는 이번 해커톤 MVP 스코프에 비해 과함(YAGNI) — 프런트엔드에서 "코드를 잘 적어두세요" 확인 UI로 대체 가능하고 백엔드 상태 변경은 없음. `TRANSFER_CODE_CONFIRM_MISMATCH`는 구현하지 않는다. 코드 형식 검증(`INVALID_TRANSFER_CODE_FORMAT`)과 만료/사용됨(`TRANSFER_CODE_EXPIRED_OR_USED`), 자기 자신 승계 금지(`CANNOT_TRANSFER_TO_SELF`) 3개만 구현한다.

- [ ] **Step 1: `ErrorCode`에 3개 추가**

```java
    INVALID_TRANSFER_CODE_FORMAT(HttpStatus.BAD_REQUEST, "승계 코드 형식이 올바르지 않습니다."),
    TRANSFER_CODE_EXPIRED_OR_USED(HttpStatus.BAD_REQUEST, "승계 코드가 만료되었거나 이미 사용되었습니다."),
    CANNOT_TRANSFER_TO_SELF(HttpStatus.BAD_REQUEST, "자기 자신에게는 승계할 수 없습니다."),
```

(기존 마지막 항목 `ACCOUNT_NOT_FOUND(...)` 다음, 세미콜론 앞에 삽입)

- [ ] **Step 2: 실패하는 테스트 작성**

```java
package com.mcm.passport.transfer;

import com.mcm.passport.common.exception.ApiException;
import com.mcm.passport.common.exception.ErrorCode;
import com.mcm.passport.passport.Passport;
import com.mcm.passport.passport.PassportRepository;
import com.mcm.passport.passport.UsageFrequency;
import com.mcm.passport.transfer.dto.TransferCodeResponse;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class TransferServiceTest {

    @Mock private TransferCodeRepository transferCodeRepository;
    @Mock private PassportRepository passportRepository;

    private final Clock fixedClock = Clock.fixed(
        LocalDate.of(2026, 8, 11).atStartOfDay(ZoneId.systemDefault()).toInstant(), ZoneId.systemDefault());

    private TransferService transferService;

    @Test
    void issueCodeRejectsNonOwner() {
        transferService = new TransferService(transferCodeRepository, passportRepository, fixedClock);
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.DAILY);
        when(passportRepository.findById(1L)).thenReturn(Optional.of(passport));

        assertThatThrownBy(() -> transferService.issueCode(1L, 999L))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.FORBIDDEN);
    }

    @Test
    void issueCodeInvalidatesPriorOutstandingCodesAndCreatesNew() {
        transferService = new TransferService(transferCodeRepository, passportRepository, fixedClock);
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.DAILY);
        when(passportRepository.findById(1L)).thenReturn(Optional.of(passport));
        TransferCode stale = new TransferCode(1L, "OLD123", 1L,
            LocalDate.now(fixedClock).atStartOfDay().plusDays(3));
        when(transferCodeRepository.findAllByPassportIdAndStatus(1L, TransferStatus.ISSUED))
            .thenReturn(List.of(stale));
        when(transferCodeRepository.save(any(TransferCode.class))).thenAnswer(inv -> inv.getArgument(0));

        TransferCodeResponse response = transferService.issueCode(1L, 1L);

        assertThat(stale.getStatus()).isEqualTo(TransferStatus.EXPIRED);
        assertThat(response.code()).hasSize(6);
    }
}
```

- [ ] **Step 3: 테스트 실행해서 실패 확인**

Run: `./gradlew test --tests "com.mcm.passport.transfer.TransferServiceTest"`
Expected: FAIL — `TransferService`/`TransferCodeResponse` 클래스 없음

- [ ] **Step 4: `TransferCodeResponse`, `TransferService.issueCode` 구현**

```java
package com.mcm.passport.transfer.dto;

import java.time.LocalDateTime;

public record TransferCodeResponse(String code, LocalDateTime expiresAt) {
}
```

```java
package com.mcm.passport.transfer;

import com.mcm.passport.common.exception.ApiException;
import com.mcm.passport.common.exception.ErrorCode;
import com.mcm.passport.passport.Passport;
import com.mcm.passport.passport.PassportRepository;
import com.mcm.passport.transfer.dto.TransferCodeResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.LocalDateTime;

@RequiredArgsConstructor
@Service
public class TransferService {

    private static final String CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    private static final int CODE_LENGTH = 6;
    private static final int EXPIRY_DAYS = 7;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final TransferCodeRepository transferCodeRepository;
    private final PassportRepository passportRepository;
    private final Clock clock;

    public TransferCodeResponse issueCode(Long passportId, Long requesterAccountId) {
        Passport passport = passportRepository.findById(passportId)
            .orElseThrow(() -> new ApiException(ErrorCode.PASSPORT_NOT_FOUND));
        if (!passport.isOwnedBy(requesterAccountId)) {
            throw new ApiException(ErrorCode.FORBIDDEN);
        }
        transferCodeRepository.findAllByPassportIdAndStatus(passportId, TransferStatus.ISSUED)
            .forEach(TransferCode::expire);

        LocalDateTime expiresAt = LocalDateTime.now(clock).plusDays(EXPIRY_DAYS);
        TransferCode transferCode = transferCodeRepository.save(
            new TransferCode(passportId, generateCode(), requesterAccountId, expiresAt));
        return new TransferCodeResponse(transferCode.getCode(), transferCode.getExpiresAt());
    }

    private String generateCode() {
        StringBuilder sb = new StringBuilder(CODE_LENGTH);
        for (int i = 0; i < CODE_LENGTH; i++) {
            sb.append(CODE_CHARS.charAt(RANDOM.nextInt(CODE_CHARS.length())));
        }
        return sb.toString();
    }
}
```

- [ ] **Step 5: 테스트 재실행해서 통과 확인**

Run: `./gradlew test --tests "com.mcm.passport.transfer.TransferServiceTest"`
Expected: PASS

- [ ] **Step 6: 컨트롤러 작성 (발급 엔드포인트만)**

```java
package com.mcm.passport.transfer;

import com.mcm.passport.common.security.CurrentAccount;
import com.mcm.passport.transfer.dto.TransferCodeResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class TransferController {

    private final TransferService transferService;

    @PostMapping("/api/passports/{passportId}/transfer-code")
    public ResponseEntity<TransferCodeResponse> issueCode(
            Authentication authentication, @PathVariable Long passportId) {
        return ResponseEntity.ok(transferService.issueCode(passportId, CurrentAccount.id(authentication)));
    }
}
```

- [ ] **Step 7: 컴파일 확인 후 커밋**

Run: `./gradlew compileJava compileTestJava`
Expected: BUILD SUCCESSFUL

```bash
git add src/main/java/com/mcm/passport/common/exception/ErrorCode.java src/main/java/com/mcm/passport/transfer/ src/test/java/com/mcm/passport/transfer/TransferServiceTest.java
git commit -m "feat: add transfer code issuance endpoint"
```

---

## Task 33: 승계 대상 미리보기 API (GET /api/passports/transfer/{code}/preview)

**Files:**
- Create: `src/main/java/com/mcm/passport/transfer/dto/TransferPreviewResponse.java`
- Modify: `src/main/java/com/mcm/passport/transfer/TransferService.java` (`preview` 추가)
- Modify: `src/main/java/com/mcm/passport/transfer/TransferController.java` (엔드포인트 추가)
- Test: `src/test/java/com/mcm/passport/transfer/TransferServiceTest.java` (테스트 추가)

**Interfaces:**
- Consumes: `DiagnosisRepository.findFirstByPassportIdOrderByDiagnosedAtDesc` (Task 17)
- Produces: `TransferService.preview(String code): TransferPreviewResponse` — 모델명·소유기간·최신 진단등급만 노출 (진단 원본 사진·영수증 등 비공개 데이터는 애초에 어떤 DTO에도 없으므로 별도 마스킹 로직 불필요 — Task 21의 `PassportSummaryResponse.withDiagnosis` 패턴과 동일).

> **2026-08-11 재기획 결정 근거:** "승계 후 새 소유자가 진단 원본 사진까지 볼 수 있는가"가 미확정 사항이었으나, `Diagnosis.imageUrls`/`Passport.receiptImageUrl`은 프로젝트 전역 원칙상 소유자 본인을 포함해 어떤 공개 API/DTO에도 애초에 노출되지 않는다(Task 13/19에서 이미 그렇게 구현됨, `PassportResponse`/`DiagnosisResponse` 참고). 따라서 "사진도 마스킹" 결정은 기존 구현과 이미 100% 일치하며, 승계 전용 마스킹 로직이 필요 없다.

- [ ] **Step 1: 실패하는 테스트 추가**

```java
    @Test
    void previewRejectsExpiredOrUsedCode() {
        transferService = new TransferService(transferCodeRepository, passportRepository, diagnosisRepository, fixedClock);
        TransferCode expired = new TransferCode(1L, "AB12CD", 1L,
            LocalDate.now(fixedClock).atStartOfDay().minusDays(1));
        when(transferCodeRepository.findByCode("AB12CD")).thenReturn(Optional.of(expired));

        assertThatThrownBy(() -> transferService.preview("AB12CD"))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.TRANSFER_CODE_EXPIRED_OR_USED);
    }

    @Test
    void previewReturnsModelNameOwnershipDaysAndGrade() {
        transferService = new TransferService(transferCodeRepository, passportRepository, diagnosisRepository, fixedClock);
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.DAILY);
        TransferCode code = new TransferCode(1L, "AB12CD", 1L,
            LocalDate.now(fixedClock).atStartOfDay().plusDays(3));
        when(transferCodeRepository.findByCode("AB12CD")).thenReturn(Optional.of(code));
        when(passportRepository.findById(1L)).thenReturn(Optional.of(passport));
        when(diagnosisRepository.findFirstByPassportIdOrderByDiagnosedAtDesc(any()))
            .thenReturn(Optional.empty());

        TransferPreviewResponse response = transferService.preview("AB12CD");

        assertThat(response.modelName()).isEqualTo("Nomad Backpack");
        assertThat(response.overallGrade()).isNull();
    }
```

(테스트 클래스 상단에 `@Mock private com.mcm.passport.diagnosis.DiagnosisRepository diagnosisRepository;` 필드 추가, `TransferPreviewResponse`/`Optional` import 추가. **Task 32에서 만든 두 테스트의 `new TransferService(transferCodeRepository, passportRepository, fixedClock)` 3-인자 호출도 `new TransferService(transferCodeRepository, passportRepository, diagnosisRepository, fixedClock)` 4-인자로 갱신한다.**)

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `./gradlew test --tests "com.mcm.passport.transfer.TransferServiceTest"`
Expected: FAIL

- [ ] **Step 3: `TransferPreviewResponse`, `TransferService.preview` 구현**

```java
package com.mcm.passport.transfer.dto;

public record TransferPreviewResponse(String modelName, long ownershipDays, String overallGrade) {
}
```

`TransferService`에 `DiagnosisRepository` 필드 추가(생성자 파라미터 확장), 아래 메서드 추가:

```java
    public TransferPreviewResponse preview(String code) {
        TransferCode transferCode = getRedeemableCode(code);
        Passport passport = passportRepository.findById(transferCode.getPassportId())
            .orElseThrow(() -> new ApiException(ErrorCode.PASSPORT_NOT_FOUND));
        long ownershipDays = java.time.temporal.ChronoUnit.DAYS.between(
            passport.getPurchaseDate(), java.time.LocalDate.now(clock));
        String overallGrade = diagnosisRepository.findFirstByPassportIdOrderByDiagnosedAtDesc(passport.getId())
            .map(d -> d.getOverallGrade().name())
            .orElse(null);
        return new TransferPreviewResponse(passport.getModelName(), ownershipDays, overallGrade);
    }

    private TransferCode getRedeemableCode(String code) {
        TransferCode transferCode = transferCodeRepository.findByCode(code)
            .orElseThrow(() -> new ApiException(ErrorCode.TRANSFER_CODE_EXPIRED_OR_USED));
        if (!transferCode.isRedeemable(LocalDateTime.now(clock))) {
            throw new ApiException(ErrorCode.TRANSFER_CODE_EXPIRED_OR_USED);
        }
        return transferCode;
    }
```

(존재하지 않는 코드와 만료/사용된 코드를 같은 에러로 처리 — Task 8의 비밀번호 재설정에서 확립한 "존재 여부를 노출하지 않는다" 원칙과 동일한 이유. `getRedeemableCode`는 Task 34의 `redeem`에서도 재사용한다.)

- [ ] **Step 4: 테스트 재실행해서 통과 확인**

Run: `./gradlew test --tests "com.mcm.passport.transfer.TransferServiceTest"`
Expected: PASS

- [ ] **Step 5: 컨트롤러에 엔드포인트 추가**

```java
    @GetMapping("/api/passports/transfer/{code}/preview")
    public ResponseEntity<com.mcm.passport.transfer.dto.TransferPreviewResponse> preview(@PathVariable String code) {
        return ResponseEntity.ok(transferService.preview(code));
    }
```

(`import org.springframework.web.bind.annotation.GetMapping;` 추가. 이 엔드포인트는 소유권 검증이 없다 — 승계 코드를 받은 사람이 자신이 아직 소유자가 아닌 상태에서 미리보기를 해야 하므로, `Authentication`은 JWT 인증 자체(로그인 여부)만 확인하고 별도 파라미터로 받지 않는다.)

- [ ] **Step 6: 컴파일 확인 후 커밋**

Run: `./gradlew compileJava compileTestJava`
Expected: BUILD SUCCESSFUL

```bash
git add src/main/java/com/mcm/passport/transfer/ src/test/java/com/mcm/passport/transfer/TransferServiceTest.java
git commit -m "feat: add transfer preview endpoint"
```

---

## Task 34: 승계 실행 API (POST /api/passports/transfer/redeem)

**Files:**
- Create: `src/main/java/com/mcm/passport/transfer/dto/RedeemTransferRequest.java`
- Modify: `src/main/java/com/mcm/passport/passport/Passport.java` (`transferOwnershipTo` 메서드 추가)
- Modify: `src/main/java/com/mcm/passport/transfer/TransferService.java` (`redeem` 추가)
- Modify: `src/main/java/com/mcm/passport/transfer/TransferController.java` (엔드포인트 추가)
- Test: `src/test/java/com/mcm/passport/transfer/TransferServiceTest.java` (테스트 추가)

**Interfaces:**
- Produces: `TransferService.redeem(String code, Long requesterAccountId): PassportResponse`

> **승계 후 이력 유지 근거 (`백엔드_신규구현사항.md` 1-1절):** `Diagnosis`/`CareRecord`/`TimelineEvent`는 전부 `passportId`만 참조하므로, `Passport.ownerAccountId`만 갱신하면 이력 전체가 자동으로 새 소유자에게 승계된다. 별도 마이그레이션이나 이력 복사 로직이 필요 없다.

- [ ] **Step 1: `Passport`에 소유권 이전 메서드 추가**

```java
    public void transferOwnershipTo(Long newOwnerAccountId) {
        this.ownerAccountId = newOwnerAccountId;
    }
```

(`updateProfile` 메서드 바로 아래에 추가)

- [ ] **Step 2: 실패하는 테스트 추가**

```java
    @Test
    void redeemRejectsSelfTransfer() {
        transferService = new TransferService(transferCodeRepository, passportRepository, diagnosisRepository, fixedClock);
        TransferCode code = new TransferCode(1L, "AB12CD", 1L,
            LocalDate.now(fixedClock).atStartOfDay().plusDays(3));
        when(transferCodeRepository.findByCode("AB12CD")).thenReturn(Optional.of(code));

        assertThatThrownBy(() -> transferService.redeem("AB12CD", 1L))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.CANNOT_TRANSFER_TO_SELF);
    }

    @Test
    void redeemTransfersOwnershipAndMarksCodeRedeemed() {
        transferService = new TransferService(transferCodeRepository, passportRepository, diagnosisRepository, fixedClock);
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.DAILY);
        TransferCode code = new TransferCode(1L, "AB12CD", 1L,
            LocalDate.now(fixedClock).atStartOfDay().plusDays(3));
        when(transferCodeRepository.findByCode("AB12CD")).thenReturn(Optional.of(code));
        when(passportRepository.findById(1L)).thenReturn(Optional.of(passport));

        var response = transferService.redeem("AB12CD", 2L);

        assertThat(response.id()).isNull(); // 저장 목이 아니므로 id는 미할당, 소유권 이전만 검증
        assertThat(passport.isOwnedBy(2L)).isTrue();
        assertThat(code.getStatus()).isEqualTo(TransferStatus.REDEEMED);
        assertThat(code.getRedeemedByAccountId()).isEqualTo(2L);
    }
```

- [ ] **Step 3: 테스트 실행해서 실패 확인**

Run: `./gradlew test --tests "com.mcm.passport.transfer.TransferServiceTest"`
Expected: FAIL — `redeem` 메서드 없음

- [ ] **Step 4: `RedeemTransferRequest`, `TransferService.redeem` 구현**

```java
package com.mcm.passport.transfer.dto;

import jakarta.validation.constraints.NotBlank;

public record RedeemTransferRequest(@NotBlank String code) {
}
```

```java
    public com.mcm.passport.passport.dto.PassportResponse redeem(String code, Long requesterAccountId) {
        TransferCode transferCode = getRedeemableCode(code);
        if (transferCode.getIssuedByAccountId().equals(requesterAccountId)) {
            throw new ApiException(ErrorCode.CANNOT_TRANSFER_TO_SELF);
        }
        Passport passport = passportRepository.findById(transferCode.getPassportId())
            .orElseThrow(() -> new ApiException(ErrorCode.PASSPORT_NOT_FOUND));
        passport.transferOwnershipTo(requesterAccountId);
        transferCode.redeem(requesterAccountId);
        return com.mcm.passport.passport.dto.PassportResponse.from(passport);
    }
```

(`@Transactional`을 클래스에 추가해 `passport.transferOwnershipTo`와 `transferCode.redeem`이 같은 트랜잭션에서 커밋되게 한다 — `import org.springframework.transaction.annotation.Transactional;` 및 클래스 선언에 `@Transactional` 추가.)

- [ ] **Step 5: 테스트 재실행해서 통과 확인**

Run: `./gradlew test --tests "com.mcm.passport.transfer.TransferServiceTest"`
Expected: PASS

- [ ] **Step 6: 컨트롤러에 엔드포인트 추가**

```java
    @PostMapping("/api/passports/transfer/redeem")
    public ResponseEntity<com.mcm.passport.passport.dto.PassportResponse> redeem(
            Authentication authentication,
            @org.springframework.web.bind.annotation.RequestBody @jakarta.validation.Valid
            com.mcm.passport.transfer.dto.RedeemTransferRequest request) {
        return ResponseEntity.ok(transferService.redeem(request.code(), CurrentAccount.id(authentication)));
    }
```

- [ ] **Step 7: 컴파일 확인 후 커밋**

Run: `./gradlew compileJava compileTestJava`
Expected: BUILD SUCCESSFUL

```bash
git add src/main/java/com/mcm/passport/passport/Passport.java src/main/java/com/mcm/passport/transfer/ src/test/java/com/mcm/passport/transfer/TransferServiceTest.java
git commit -m "feat: add transfer redeem endpoint"
```

- [ ] **Step 8: 여권 승계 엔드투엔드 회귀 테스트 (Task 30 패턴 재사용)**

`EndToEndFlowTest`에 이어서, A 계정이 여권을 등록하고 승계 코드를 발급 → B 계정이 그 코드로 미리보기 조회 → B 계정이 승계 실행 → B 계정의 `/api/passports` 목록에 해당 여권이 나타나고 A 계정 목록에서는 사라지는지(더 이상 `ownerAccountId`가 A가 아니므로) 확인하는 통합 테스트를 `TransferControllerIntegrationTest.java`로 새로 추가한다 (신규 파일, `AbstractIntegrationTest` 기반, 회원가입 2명(A/B) → A 로그인 → 등록 → 발급 → B 로그인 → 미리보기 → 승계 → 양쪽 목록 조회 순서).

Run: `./gradlew test --tests "com.mcm.passport.transfer.TransferControllerIntegrationTest"`
Expected: PASS

```bash
git add src/test/java/com/mcm/passport/transfer/TransferControllerIntegrationTest.java
git commit -m "test: add transfer end-to-end regression test"
```

---

## 실행 순서 요약

Task 1-9 (계정) → Task 10-16 (여권 등록, 부분 유니크 인덱스) → Task 17-21 (마모 진단 + 규칙기반 엔진) → Task 22-26 (타이밍 알림 + 스케줄러) → Task 27-30 (케어 기록 + 타임라인 + 회귀 테스트) → **Task 31-34 (여권 승계, 2026-08-11 재기획 추가)**.

각 태스크는 이전 태스크가 만든 파일에 의존하므로 반드시 순서대로 진행한다. Task 9→16, 19→24, 14→21 사이처럼 "먼저 반쪽만 구현하고 나중 태스크에서 마저 연결"하는 지점은 각 태스크 설명에 명시해뒀다. Task 31-34는 `account`/`passport`/`diagnosis` 도메인에만 의존하므로 Task 21 완료 이후 아무 시점에나 끼워 넣어도 되지만, 기존 30개 태스크 뒤에 이어 붙이는 편이 리뷰 히스토리를 깨끗하게 유지한다.

