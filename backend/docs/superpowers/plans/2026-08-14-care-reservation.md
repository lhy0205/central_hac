# 공식 케어 예약(Reservation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real store/timeslot reservation system (Store + Reservation domains) to the MCM Nomad Passport backend, replacing the CTA-button-only version of FR-CAR-04.

**Architecture:** Two new package-by-feature domains (`store`, `reservation`) added to the existing Spring Boot monolith, following the exact same layering every other domain uses (`Entity` → `Repository` → `Service` → `Controller` + `dto/`). `Reservation` depends on `Store` (one-directional: reservation looks up store info, store never depends on reservation). Double-booking is prevented by a Postgres partial unique index, not application-level locking. `TimelineService` gains a 5th source. `PassportService.delete()` and `AccountService.withdraw()` both get a small addition to cancel any pending reservations when a passport is deleted.

**Tech Stack:** Spring Boot 3.3.4, Spring Data JPA, PostgreSQL (Testcontainers in tests), Flyway migrations, Lombok, JUnit 5 + Mockito (unit) + Testcontainers (integration), AssertJ.

**Spec:** `docs/superpowers/specs/2026-08-14-care-reservation-design.md`

## Global Constraints

- Ownership/withdrawn-account/deleted-passport checks always go through `PassportOwnershipGuard.getOwnedActivePassport(passportId, requesterAccountId)` — never re-implement this check.
- All `LocalDateTime.now()` calls use the injected `Clock` bean (`java.time.Clock`), never the system clock directly.
- Cross-domain reads use repositories directly (e.g. `ReservationService` depends on `StoreRepository`, not `StoreService`) — this mirrors `NotificationService`'s existing dependency on `PassportRepository`/`DiagnosisRepository`.
- New `ErrorCode` entries follow the existing `(HttpStatus, Korean message)` enum pattern in `src/main/java/com/mcm/passport/common/exception/ErrorCode.java`.
- List endpoints use `Page<T>` + `@PageableDefault(size = 20)`, same as `CareRecordController`/`PassportController`.
- Every new `@Service` class is `@RequiredArgsConstructor` + class-level `@Transactional` (no `readOnly = true` — this codebase doesn't use that distinction anywhere).
- Migrations continue the existing `V<N>__description.sql` numbering; next free numbers are V11 and V12.
- All new entities use `@NoArgsConstructor(access = AccessLevel.PROTECTED)` + Lombok `@Getter`, matching every existing entity.
- Test file placement/naming mirrors existing packages exactly: unit tests use Mockito (`@ExtendWith(MockitoExtension.class)`), integration tests extend `com.mcm.passport.support.AbstractIntegrationTest`.

---

### Task 1: Store entity, migration, repository

**Files:**
- Create: `src/main/resources/db/migration/V11__create_store_table.sql`
- Create: `src/main/java/com/mcm/passport/store/Store.java`
- Create: `src/main/java/com/mcm/passport/store/StoreRepository.java`
- Test: `src/test/java/com/mcm/passport/store/StoreRepositoryTest.java`

**Interfaces:**
- Produces: `Store` entity with `getId()`, `getName()`, `getAddress()`, `getBusinessHoursStart()` (`LocalTime`), `getBusinessHoursEnd()` (`LocalTime`), `getSlotLengthMinutes()` (`int`). `StoreRepository extends JpaRepository<Store, Long>` (no custom methods — `findAll(Pageable)`/`findById` come from `JpaRepository`).

- [ ] **Step 1: Write the migration**

```sql
CREATE TABLE store (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    address VARCHAR(200) NOT NULL,
    business_hours_start TIME NOT NULL,
    business_hours_end TIME NOT NULL,
    slot_length_minutes INT NOT NULL
);

INSERT INTO store (name, address, business_hours_start, business_hours_end, slot_length_minutes) VALUES
    ('MCM 강남점', '서울 강남구 압구정로 165', '10:00', '19:00', 60),
    ('MCM 명동점', '서울 중구 명동길 43', '10:30', '20:00', 60),
    ('MCM 부산센텀점', '부산 해운대구 센텀중앙로 55', '10:00', '18:30', 60);
```

Save as `src/main/resources/db/migration/V11__create_store_table.sql`.

- [ ] **Step 2: Write the failing integration test**

```java
package com.mcm.passport.store;

import com.mcm.passport.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.LocalTime;

import static org.assertj.core.api.Assertions.assertThat;

class StoreRepositoryTest extends AbstractIntegrationTest {

    @Autowired
    private StoreRepository storeRepository;

    @Test
    void migrationSeedsThreeStores() {
        assertThat(storeRepository.findAll()).hasSize(3);
    }

    @Test
    void seededStoreHasBusinessHoursAndSlotLength() {
        Store gangnam = storeRepository.findAll().stream()
            .filter(s -> s.getName().equals("MCM 강남점"))
            .findFirst().orElseThrow();

        assertThat(gangnam.getBusinessHoursStart()).isEqualTo(LocalTime.of(10, 0));
        assertThat(gangnam.getBusinessHoursEnd()).isEqualTo(LocalTime.of(19, 0));
        assertThat(gangnam.getSlotLengthMinutes()).isEqualTo(60);
    }
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `./gradlew test --tests "com.mcm.passport.store.StoreRepositoryTest"`
Expected: FAIL to compile — `Store`/`StoreRepository` don't exist yet.

- [ ] **Step 4: Write the entity**

```java
package com.mcm.passport.store;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalTime;

// 매장 CRUD API는 없다(기획서 3.8절, 확정) — 이 엔티티는 시드 마이그레이션으로만 채워지고
// 앱 코드에서는 읽기 전용으로만 쓰인다.
@Entity
@Table(name = "store")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Store {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String name;

    private String address;

    private LocalTime businessHoursStart;

    private LocalTime businessHoursEnd;

    private int slotLengthMinutes;
}
```

- [ ] **Step 5: Write the repository**

```java
package com.mcm.passport.store;

import org.springframework.data.jpa.repository.JpaRepository;

public interface StoreRepository extends JpaRepository<Store, Long> {
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `./gradlew test --tests "com.mcm.passport.store.StoreRepositoryTest"`
Expected: PASS (2 tests)

- [ ] **Step 7: Commit**

```bash
git add src/main/resources/db/migration/V11__create_store_table.sql \
        src/main/java/com/mcm/passport/store/Store.java \
        src/main/java/com/mcm/passport/store/StoreRepository.java \
        src/test/java/com/mcm/passport/store/StoreRepositoryTest.java
git commit -m "feat: add Store entity with seeded store data"
```

---

### Task 2: Store service, controller, DTO

**Files:**
- Create: `src/main/java/com/mcm/passport/store/dto/StoreResponse.java`
- Create: `src/main/java/com/mcm/passport/store/StoreService.java`
- Create: `src/main/java/com/mcm/passport/store/StoreController.java`
- Modify: `src/main/java/com/mcm/passport/common/exception/ErrorCode.java`
- Test: `src/test/java/com/mcm/passport/store/StoreServiceTest.java`
- Test: `src/test/java/com/mcm/passport/store/StoreControllerIntegrationTest.java`

**Interfaces:**
- Consumes: `Store`/`StoreRepository` from Task 1.
- Produces: `StoreResponse(Long id, String name, String address, LocalTime businessHoursStart, LocalTime businessHoursEnd, int slotLengthMinutes)`. `StoreService.list(Pageable): Page<StoreResponse>`, `StoreService.getDetail(Long storeId): StoreResponse` (throws `ApiException(ErrorCode.STORE_NOT_FOUND)`). `GET /api/stores`, `GET /api/stores/{id}`.

- [ ] **Step 1: Add the new ErrorCode entries**

In `src/main/java/com/mcm/passport/common/exception/ErrorCode.java`, replace the last enum constant's trailing `;` and add four new codes (two used here, two used by Reservation in later tasks — adding all four now keeps this the single place that touches this enum's declaration list):

```java
    INVALID_CURRENT_PASSWORD(HttpStatus.BAD_REQUEST, "현재 비밀번호가 올바르지 않습니다."),
    STORE_NOT_FOUND(HttpStatus.NOT_FOUND, "매장을 찾을 수 없습니다."),
    RESERVATION_NOT_FOUND(HttpStatus.NOT_FOUND, "예약을 찾을 수 없습니다."),
    SLOT_ALREADY_BOOKED(HttpStatus.CONFLICT, "이미 예약된 시간입니다."),
    INVALID_SLOT_TIME(HttpStatus.BAD_REQUEST, "매장 영업시간에 맞지 않는 예약 시간입니다.");
```

(This replaces the previous final line `INVALID_CURRENT_PASSWORD(HttpStatus.BAD_REQUEST, "현재 비밀번호가 올바르지 않습니다.");` — note the semicolon moves to the new last entry.)

- [ ] **Step 2: Write the failing unit test**

```java
package com.mcm.passport.store;

import com.mcm.passport.common.exception.ApiException;
import com.mcm.passport.common.exception.ErrorCode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class StoreServiceTest {

    @Mock private StoreRepository storeRepository;

    private StoreService storeService;

    @Test
    void getDetailReturnsStoreResponse() {
        storeService = new StoreService(storeRepository);
        Store store = newStore();
        when(storeRepository.findById(1L)).thenReturn(Optional.of(store));

        var response = storeService.getDetail(1L);

        assertThat(response.name()).isEqualTo("MCM 강남점");
        assertThat(response.slotLengthMinutes()).isEqualTo(60);
    }

    @Test
    void getDetailThrowsNotFoundWhenStoreMissing() {
        storeService = new StoreService(storeRepository);
        when(storeRepository.findById(999L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> storeService.getDetail(999L))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.STORE_NOT_FOUND);
    }

    private Store newStore() {
        // 리플렉션 없이 만들 수 없다면 @NoArgsConstructor(PROTECTED)뿐이므로, Task 1의 Store에는
        // 테스트용 생성자가 없다 — 이 테스트는 실제로는 findById가 반환할 목(mock) 객체가 필요하므로
        // org.mockito.Mockito.mock(Store.class)를 대신 쓴다. 아래 실제 구현 참고.
        return null;
    }
}
```

Since `Store` has no public constructor (Task 1 deliberately gave it only a protected no-args one — it's never constructed by app code), replace the `newStore()` helper with a Mockito mock instead of `new Store(...)`:

```java
    private Store newStore() {
        Store store = org.mockito.Mockito.mock(Store.class);
        when(store.getName()).thenReturn("MCM 강남점");
        when(store.getAddress()).thenReturn("서울 강남구 압구정로 165");
        when(store.getBusinessHoursStart()).thenReturn(LocalTime.of(10, 0));
        when(store.getBusinessHoursEnd()).thenReturn(LocalTime.of(19, 0));
        when(store.getSlotLengthMinutes()).thenReturn(60);
        return store;
    }
```

- [ ] **Step 3: Run test to verify it fails**

Run: `./gradlew test --tests "com.mcm.passport.store.StoreServiceTest"`
Expected: FAIL to compile — `StoreService`/`StoreResponse` don't exist.

- [ ] **Step 4: Write the DTO**

```java
package com.mcm.passport.store.dto;

import com.mcm.passport.store.Store;

import java.time.LocalTime;

public record StoreResponse(
    Long id, String name, String address,
    LocalTime businessHoursStart, LocalTime businessHoursEnd, int slotLengthMinutes
) {
    public static StoreResponse from(Store store) {
        return new StoreResponse(store.getId(), store.getName(), store.getAddress(),
            store.getBusinessHoursStart(), store.getBusinessHoursEnd(), store.getSlotLengthMinutes());
    }
}
```

- [ ] **Step 5: Write the service**

```java
package com.mcm.passport.store;

import com.mcm.passport.common.exception.ApiException;
import com.mcm.passport.common.exception.ErrorCode;
import com.mcm.passport.store.dto.StoreResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class StoreService {

    private final StoreRepository storeRepository;

    public Page<StoreResponse> list(Pageable pageable) {
        return storeRepository.findAll(pageable).map(StoreResponse::from);
    }

    public StoreResponse getDetail(Long storeId) {
        return storeRepository.findById(storeId)
            .map(StoreResponse::from)
            .orElseThrow(() -> new ApiException(ErrorCode.STORE_NOT_FOUND));
    }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `./gradlew test --tests "com.mcm.passport.store.StoreServiceTest"`
Expected: PASS (2 tests)

- [ ] **Step 7: Write the failing controller integration test**

```java
package com.mcm.passport.store;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mcm.passport.account.Account;
import com.mcm.passport.account.AccountRepository;
import com.mcm.passport.common.security.JwtTokenProvider;
import com.mcm.passport.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
class StoreControllerIntegrationTest extends AbstractIntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private AccountRepository accountRepository;
    @Autowired private JwtTokenProvider jwtTokenProvider;

    @Test
    void listReturnsSeededStores() throws Exception {
        Account account = accountRepository.save(new Account("store-list@example.com", "hash", "닉네임"));
        String token = jwtTokenProvider.generateToken(account.getId());

        mockMvc.perform(get("/api/stores").header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content.length()").value(3));
    }

    @Test
    void getDetailReturns404ForUnknownStore() throws Exception {
        Account account = accountRepository.save(new Account("store-detail@example.com", "hash", "닉네임"));
        String token = jwtTokenProvider.generateToken(account.getId());

        mockMvc.perform(get("/api/stores/999999").header("Authorization", "Bearer " + token))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("STORE_NOT_FOUND"));
    }

    @Test
    void listRequiresAuthentication() throws Exception {
        mockMvc.perform(get("/api/stores"))
            .andExpect(status().isUnauthorized());
    }
}
```

(This follows the same `MockMvc` + real JWT + `AbstractIntegrationTest` pattern as `PassportControllerIntegrationTest` — check that file if any import differs from what compiles.)

- [ ] **Step 8: Run test to verify it fails**

Run: `./gradlew test --tests "com.mcm.passport.store.StoreControllerIntegrationTest"`
Expected: FAIL to compile — `StoreController` doesn't exist.

- [ ] **Step 9: Write the controller**

```java
package com.mcm.passport.store;

import com.mcm.passport.store.dto.StoreResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class StoreController {

    private final StoreService storeService;

    @GetMapping("/api/stores")
    public ResponseEntity<Page<StoreResponse>> list(@PageableDefault(size = 20) Pageable pageable) {
        return ResponseEntity.ok(storeService.list(pageable));
    }

    @GetMapping("/api/stores/{id}")
    public ResponseEntity<StoreResponse> getDetail(@PathVariable Long id) {
        return ResponseEntity.ok(storeService.getDetail(id));
    }
}
```

- [ ] **Step 10: Run test to verify it passes**

Run: `./gradlew test --tests "com.mcm.passport.store.StoreControllerIntegrationTest"`
Expected: PASS (3 tests)

- [ ] **Step 11: Commit**

```bash
git add src/main/java/com/mcm/passport/common/exception/ErrorCode.java \
        src/main/java/com/mcm/passport/store/dto/StoreResponse.java \
        src/main/java/com/mcm/passport/store/StoreService.java \
        src/main/java/com/mcm/passport/store/StoreController.java \
        src/test/java/com/mcm/passport/store/StoreServiceTest.java \
        src/test/java/com/mcm/passport/store/StoreControllerIntegrationTest.java
git commit -m "feat: add Store list/detail read API"
```

---

### Task 3: Reservation entity, migration, repository

**Files:**
- Create: `src/main/resources/db/migration/V12__create_reservation_table.sql`
- Create: `src/main/java/com/mcm/passport/reservation/CareRequestItemType.java`
- Create: `src/main/java/com/mcm/passport/reservation/ReservationStatus.java`
- Create: `src/main/java/com/mcm/passport/reservation/Reservation.java`
- Create: `src/main/java/com/mcm/passport/reservation/ReservationRepository.java`
- Modify: `src/test/java/com/mcm/passport/support/AbstractIntegrationTest.java`
- Test: `src/test/java/com/mcm/passport/reservation/ReservationRepositoryTest.java`

**Interfaces:**
- Consumes: nothing from earlier tasks directly (raw `Long passportId`/`storeId`, same convention as `Diagnosis`/`CareRecord`).
- Produces: `Reservation(Long passportId, Long storeId, LocalDateTime slotDateTime, List<String> requestItems)` constructor, `getId/getPassportId/getStoreId/getSlotDateTime/getStatus(): ReservationStatus`, `getRequestItems(): List<String>` (enum names, not typed — Task 6's DTO layer converts), `cancel()` (idempotent — sets status to `CANCELLED` regardless of current state), `isRequested(): boolean`. `ReservationRepository.findAllByPassportIdOrderBySlotDateTimeDesc(Long, Pageable): Page<Reservation>`, `.findAllByPassportId(Long): List<Reservation>`, `.findAllByStoreIdAndSlotDateTimeBetweenAndStatus(Long, LocalDateTime, LocalDateTime, ReservationStatus): List<Reservation>`, `.cancelAllRequestedForPassport(Long passportId): void` (bulk update, used by Tasks 9–10).

- [ ] **Step 1: Write the migration**

```sql
CREATE TABLE reservation (
    id BIGSERIAL PRIMARY KEY,
    passport_id BIGINT NOT NULL REFERENCES passport(id),
    store_id BIGINT NOT NULL REFERENCES store(id),
    slot_date_time TIMESTAMP NOT NULL,
    request_items TEXT[] NOT NULL,
    status VARCHAR(20) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_reservation_store_slot_requested
    ON reservation (store_id, slot_date_time)
    WHERE status = 'REQUESTED';
```

Save as `src/main/resources/db/migration/V12__create_reservation_table.sql`.

- [ ] **Step 2: Update `AbstractIntegrationTest`'s per-test cleanup**

Open `src/test/java/com/mcm/passport/support/AbstractIntegrationTest.java`. Add `reservation` to the `TRUNCATE TABLE` list — but **do not** add `store`: `store` is seed-only reference data inserted once by the V11 migration when the shared Testcontainers Postgres starts, not per-test data. Truncating it would wipe the seed rows after the first test class runs and leave every later test with zero stores.

```java
    @BeforeEach
    void cleanDatabase() {
        jdbcTemplate.execute("""
            TRUNCATE TABLE
                reservation, timeline_event, transfer_code, notification, care_record,
                diagnosis, password_reset_token, passport, account, shedlock
            RESTART IDENTITY CASCADE
            """);
    }
```

(`reservation` is listed first because it has foreign keys into `passport`; listing order doesn't actually matter for `TRUNCATE ... CASCADE` — Postgres resolves dependency order itself — but this keeps the list readable as "leaf tables first".)

- [ ] **Step 3: Write the failing integration test**

```java
package com.mcm.passport.reservation;

import com.mcm.passport.account.Account;
import com.mcm.passport.account.AccountRepository;
import com.mcm.passport.passport.Passport;
import com.mcm.passport.passport.PassportRepository;
import com.mcm.passport.passport.UsageFrequency;
import com.mcm.passport.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ReservationRepositoryTest extends AbstractIntegrationTest {

    @Autowired private ReservationRepository reservationRepository;
    @Autowired private PassportRepository passportRepository;
    @Autowired private AccountRepository accountRepository;

    @Test
    void doubleBookingSameStoreAndSlotIsRejectedByDbConstraint() {
        Long passportId = newPassport("res-a@example.com", "A1234");
        LocalDateTime slot = LocalDateTime.of(2026, 9, 1, 14, 0);
        reservationRepository.saveAndFlush(
            new Reservation(passportId, 1L, slot, List.of(CareRequestItemType.LEATHER_CLEANING.name())));

        assertThatThrownBy(() -> reservationRepository.saveAndFlush(
                new Reservation(passportId, 1L, slot, List.of(CareRequestItemType.OTHER.name()))))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void sameSlotAllowedAfterCancellation() {
        Long passportId = newPassport("res-b@example.com", "B1111");
        LocalDateTime slot = LocalDateTime.of(2026, 9, 1, 15, 0);
        Reservation first = reservationRepository.saveAndFlush(
            new Reservation(passportId, 1L, slot, List.of(CareRequestItemType.OTHER.name())));
        first.cancel();
        reservationRepository.saveAndFlush(first);

        Reservation second = reservationRepository.saveAndFlush(
            new Reservation(passportId, 1L, slot, List.of(CareRequestItemType.OTHER.name())));

        assertThat(second.getId()).isNotEqualTo(first.getId());
    }

    @Test
    void cancelAllRequestedForPassportOnlyTouchesRequestedRows() {
        Long passportId = newPassport("res-c@example.com", "C2222");
        Reservation requested = reservationRepository.saveAndFlush(new Reservation(
            passportId, 1L, LocalDateTime.of(2026, 9, 2, 10, 0), List.of(CareRequestItemType.OTHER.name())));
        Reservation alreadyCancelled = reservationRepository.saveAndFlush(new Reservation(
            passportId, 1L, LocalDateTime.of(2026, 9, 2, 11, 0), List.of(CareRequestItemType.OTHER.name())));
        alreadyCancelled.cancel();
        reservationRepository.saveAndFlush(alreadyCancelled);

        reservationRepository.cancelAllRequestedForPassport(passportId);
        reservationRepository.flush();

        Reservation reloaded = reservationRepository.findById(requested.getId()).orElseThrow();
        assertThat(reloaded.getStatus()).isEqualTo(ReservationStatus.CANCELLED);
    }

    private Long newPassport(String email, String serial) {
        Account account = accountRepository.save(new Account(email, "hash", "닉네임"));
        Passport passport = passportRepository.save(new Passport(serial, 2024, account.getId(),
            "Nomad Backpack", "애칭", LocalDate.of(2024, 1, 1), "MCM 강남점", null, false,
            List.of(), UsageFrequency.OCCASIONAL));
        return passport.getId();
    }
}
```

- [ ] **Step 4: Run test to verify it fails**

Run: `./gradlew test --tests "com.mcm.passport.reservation.ReservationRepositoryTest"`
Expected: FAIL to compile — none of the reservation classes exist yet.

- [ ] **Step 5: Write the enums**

```java
package com.mcm.passport.reservation;

public enum CareRequestItemType {
    LEATHER_CLEANING, METAL_POLISHING, STITCHING_REPAIR, OTHER
}
```

```java
package com.mcm.passport.reservation;

public enum ReservationStatus {
    REQUESTED, CANCELLED
}
```

- [ ] **Step 6: Write the entity**

```java
package com.mcm.passport.reservation;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;
import java.util.List;

@Entity
@Table(name = "reservation")
@EntityListeners(AuditingEntityListener.class)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Reservation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "passport_id", nullable = false)
    private Long passportId;

    @Column(name = "store_id", nullable = false)
    private Long storeId;

    @Column(name = "slot_date_time", nullable = false)
    private LocalDateTime slotDateTime;

    // Diagnosis.imageUrls와 동일 패턴: CareRequestItemType 이름을 text[]로 저장한다. 엔티티
    // 자체는 원시 문자열만 다루고, enum 변환은 DTO 계층(ReservationResponse.from,
    // ReservationService.create)에서 한다 — 이 코드베이스의 기존 컨벤션과 동일.
    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "request_items", columnDefinition = "text[]", nullable = false)
    private List<String> requestItems;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ReservationStatus status;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public Reservation(Long passportId, Long storeId, LocalDateTime slotDateTime, List<String> requestItems) {
        this.passportId = passportId;
        this.storeId = storeId;
        this.slotDateTime = slotDateTime;
        this.requestItems = requestItems;
        this.status = ReservationStatus.REQUESTED;
    }

    // 이미 CANCELLED여도 다시 호출하면 그대로 CANCELLED — 취소 API가 멱등하게 동작하도록
    // 서비스 계층에서 상태를 미리 확인하지 않고 그냥 호출한다(스펙 문서 2절 참고).
    public void cancel() {
        this.status = ReservationStatus.CANCELLED;
    }

    public boolean isRequested() {
        return this.status == ReservationStatus.REQUESTED;
    }
}
```

- [ ] **Step 7: Write the repository**

```java
package com.mcm.passport.reservation;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.time.LocalDateTime;
import java.util.List;

public interface ReservationRepository extends JpaRepository<Reservation, Long> {
    Page<Reservation> findAllByPassportIdOrderBySlotDateTimeDesc(Long passportId, Pageable pageable);

    List<Reservation> findAllByPassportId(Long passportId);

    List<Reservation> findAllByStoreIdAndSlotDateTimeBetweenAndStatus(
        Long storeId, LocalDateTime start, LocalDateTime end, ReservationStatus status);

    // 여권 삭제/탈퇴 시 슬롯을 반납하기 위한 벌크 취소. PassportService.delete()와
    // AccountService.withdraw() 양쪽에서 호출된다 — 둘 중 하나만 고치면 다른 경로로 삭제된 여권의
    // 예약이 REQUESTED로 영원히 남아 그 매장·시각을 아무도 못 잡게 된다(스펙 문서 7절 참고).
    @Modifying
    @Query("update Reservation r set r.status = com.mcm.passport.reservation.ReservationStatus.CANCELLED " +
           "where r.passportId = :passportId and r.status = com.mcm.passport.reservation.ReservationStatus.REQUESTED")
    void cancelAllRequestedForPassport(Long passportId);
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `./gradlew test --tests "com.mcm.passport.reservation.ReservationRepositoryTest"`
Expected: PASS (3 tests)

- [ ] **Step 9: Run the full suite once to confirm the `AbstractIntegrationTest` truncate-list change didn't break anything else**

Run: `./gradlew test`
Expected: All existing tests still pass — this specifically checks that `store` seed data survived the per-test truncate and that adding `reservation` to the list didn't accidentally break FK ordering.

- [ ] **Step 10: Commit**

```bash
git add src/main/resources/db/migration/V12__create_reservation_table.sql \
        src/main/java/com/mcm/passport/reservation/CareRequestItemType.java \
        src/main/java/com/mcm/passport/reservation/ReservationStatus.java \
        src/main/java/com/mcm/passport/reservation/Reservation.java \
        src/main/java/com/mcm/passport/reservation/ReservationRepository.java \
        src/test/java/com/mcm/passport/support/AbstractIntegrationTest.java \
        src/test/java/com/mcm/passport/reservation/ReservationRepositoryTest.java
git commit -m "feat: add Reservation entity with double-booking prevention"
```

---

### Task 4: Slot grid calculator

**Files:**
- Create: `src/main/java/com/mcm/passport/reservation/SlotGridCalculator.java`
- Test: `src/test/java/com/mcm/passport/reservation/SlotGridCalculatorTest.java`

**Interfaces:**
- Consumes: `Store` (Task 1) — only its `getBusinessHoursStart/End()`/`getSlotLengthMinutes()` getters.
- Produces: `SlotGridCalculator.gridFor(Store, LocalDate): List<LocalDateTime>` (package-private, used by Task 6's `ReservationService`), `SlotGridCalculator.isValidSlot(Store, LocalDateTime): boolean`.

- [ ] **Step 1: Write the failing unit test**

```java
package com.mcm.passport.reservation;

import com.mcm.passport.store.Store;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

class SlotGridCalculatorTest {

    @Test
    void gridForEvenlyDividedHoursCoversFullRange() {
        Store store = storeWithHours(LocalTime.of(10, 0), LocalTime.of(13, 0), 60);

        var grid = SlotGridCalculator.gridFor(store, LocalDate.of(2026, 9, 1));

        assertThat(grid).containsExactly(
            LocalDateTime.of(2026, 9, 1, 10, 0),
            LocalDateTime.of(2026, 9, 1, 11, 0),
            LocalDateTime.of(2026, 9, 1, 12, 0));
    }

    @Test
    void gridDropsTrailingPartialSlot() {
        // 10:00~18:30, 60분 슬롯 — 마지막 시작가능 슬롯은 17:00(끝나면 18:00, 아직 영업시간 안).
        // 18:00 시작은 끝나는 시각이 19:00으로 영업종료(18:30)를 넘기므로 제외돼야 한다.
        Store store = storeWithHours(LocalTime.of(17, 0), LocalTime.of(18, 30), 60);

        var grid = SlotGridCalculator.gridFor(store, LocalDate.of(2026, 9, 1));

        assertThat(grid).containsExactly(LocalDateTime.of(2026, 9, 1, 17, 0));
    }

    @Test
    void isValidSlotAcceptsGridMember() {
        Store store = storeWithHours(LocalTime.of(10, 0), LocalTime.of(13, 0), 60);

        assertThat(SlotGridCalculator.isValidSlot(store, LocalDateTime.of(2026, 9, 1, 11, 0))).isTrue();
    }

    @Test
    void isValidSlotRejectsOffGridTime() {
        Store store = storeWithHours(LocalTime.of(10, 0), LocalTime.of(13, 0), 60);

        assertThat(SlotGridCalculator.isValidSlot(store, LocalDateTime.of(2026, 9, 1, 10, 30))).isFalse();
    }

    private Store storeWithHours(LocalTime start, LocalTime end, int slotLengthMinutes) {
        Store store = Mockito.mock(Store.class);
        when(store.getBusinessHoursStart()).thenReturn(start);
        when(store.getBusinessHoursEnd()).thenReturn(end);
        when(store.getSlotLengthMinutes()).thenReturn(slotLengthMinutes);
        return store;
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew test --tests "com.mcm.passport.reservation.SlotGridCalculatorTest"`
Expected: FAIL to compile — `SlotGridCalculator` doesn't exist.

- [ ] **Step 3: Write the implementation**

```java
package com.mcm.passport.reservation;

import com.mcm.passport.store.Store;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;

// 매장 영업시간·슬롯길이로부터 그날의 슬롯 시작시각 그리드를 계산한다. 예약 생성 검증
// (ReservationService.create)과 가용 슬롯 조회(ReservationService.getAvailableSlots) 양쪽에서
// 공유되는 순수 로직이라 별도로 뺐다. 자정을 넘어가는 영업시간(예: 22:00~02:00)은 지원하지
// 않는다 — 시드 데이터(Task 1)를 포함해 이 앱의 매장은 전부 같은 날 안에서 영업이 끝난다는
// 전제가 있다.
class SlotGridCalculator {

    private SlotGridCalculator() {
    }

    static List<LocalDateTime> gridFor(Store store, LocalDate date) {
        List<LocalDateTime> slots = new ArrayList<>();
        LocalTime cursor = store.getBusinessHoursStart();
        LocalTime end = store.getBusinessHoursEnd();
        int slotLength = store.getSlotLengthMinutes();
        while (!cursor.plusMinutes(slotLength).isAfter(end)) {
            slots.add(LocalDateTime.of(date, cursor));
            cursor = cursor.plusMinutes(slotLength);
        }
        return slots;
    }

    static boolean isValidSlot(Store store, LocalDateTime slotDateTime) {
        return gridFor(store, slotDateTime.toLocalDate()).contains(slotDateTime);
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./gradlew test --tests "com.mcm.passport.reservation.SlotGridCalculatorTest"`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/main/java/com/mcm/passport/reservation/SlotGridCalculator.java \
        src/test/java/com/mcm/passport/reservation/SlotGridCalculatorTest.java
git commit -m "feat: add slot grid calculation for store business hours"
```

---

### Task 5: Reservation DTOs and service

**Files:**
- Create: `src/main/java/com/mcm/passport/reservation/dto/CreateReservationRequest.java`
- Create: `src/main/java/com/mcm/passport/reservation/dto/ReservationResponse.java`
- Create: `src/main/java/com/mcm/passport/reservation/ReservationService.java`
- Test: `src/test/java/com/mcm/passport/reservation/ReservationServiceTest.java`

**Interfaces:**
- Consumes: `Reservation`/`ReservationRepository`/`ReservationStatus`/`CareRequestItemType` (Task 3), `SlotGridCalculator` (Task 4), `Store`/`StoreRepository` (Task 1), `PassportOwnershipGuard` (existing), `ErrorCode.STORE_NOT_FOUND/RESERVATION_NOT_FOUND/SLOT_ALREADY_BOOKED/INVALID_SLOT_TIME` (Task 2).
- Produces: `CreateReservationRequest(Long storeId, LocalDateTime slotDateTime, List<CareRequestItemType> requestItems)`. `ReservationResponse(Long id, Long passportId, Long storeId, String storeName, LocalDateTime slotDateTime, List<CareRequestItemType> requestItems, ReservationStatus status, LocalDateTime createdAt)`. `ReservationService.create(Long passportId, Long requesterAccountId, CreateReservationRequest): ReservationResponse`, `.list(Long passportId, Long requesterAccountId, Pageable): Page<ReservationResponse>`, `.getDetail(Long reservationId, Long requesterAccountId): ReservationResponse`, `.cancel(Long reservationId, Long requesterAccountId): void`, `.getAvailableSlots(Long storeId, LocalDate date): List<LocalDateTime>` — used by Task 6's controller.

- [ ] **Step 1: Write the failing unit test**

```java
package com.mcm.passport.reservation;

import com.mcm.passport.common.exception.ApiException;
import com.mcm.passport.common.exception.ErrorCode;
import com.mcm.passport.passport.Passport;
import com.mcm.passport.passport.PassportOwnershipGuard;
import com.mcm.passport.reservation.dto.CreateReservationRequest;
import com.mcm.passport.store.Store;
import com.mcm.passport.store.StoreRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ReservationServiceTest {

    private static final Clock FIXED_CLOCK = Clock.fixed(
        Instant.parse("2026-08-14T00:00:00Z"), ZoneId.of("Asia/Seoul"));

    @Mock private ReservationRepository reservationRepository;
    @Mock private StoreRepository storeRepository;
    @Mock private PassportOwnershipGuard passportOwnershipGuard;

    private ReservationService reservationService;

    @Test
    void createRejectsNonOwner() {
        reservationService = newService();
        when(passportOwnershipGuard.getOwnedActivePassport(1L, 999L))
            .thenThrow(new ApiException(ErrorCode.FORBIDDEN));

        assertThatThrownBy(() -> reservationService.create(1L, 999L, new CreateReservationRequest(
                1L, LocalDateTime.of(2026, 9, 1, 14, 0), List.of(CareRequestItemType.OTHER))))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.FORBIDDEN);
    }

    @Test
    void createThrowsStoreNotFoundWhenStoreMissing() {
        reservationService = newService();
        when(passportOwnershipGuard.getOwnedActivePassport(1L, 1L)).thenReturn(mock(Passport.class));
        when(storeRepository.findById(999L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> reservationService.create(1L, 1L, new CreateReservationRequest(
                999L, LocalDateTime.of(2026, 9, 1, 14, 0), List.of(CareRequestItemType.OTHER))))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.STORE_NOT_FOUND);
    }

    @Test
    void createThrowsInvalidSlotTimeWhenOffGrid() {
        reservationService = newService();
        when(passportOwnershipGuard.getOwnedActivePassport(1L, 1L)).thenReturn(mock(Passport.class));
        when(storeRepository.findById(1L)).thenReturn(Optional.of(storeWithHours()));

        assertThatThrownBy(() -> reservationService.create(1L, 1L, new CreateReservationRequest(
                1L, LocalDateTime.of(2026, 9, 1, 14, 30), List.of(CareRequestItemType.OTHER))))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.INVALID_SLOT_TIME);
        verifyNoInteractions(reservationRepository);
    }

    @Test
    void createSavesReservationWithStoreNameInResponse() {
        reservationService = newService();
        when(passportOwnershipGuard.getOwnedActivePassport(1L, 1L)).thenReturn(mock(Passport.class));
        Store store = storeWithHours();
        when(store.getId()).thenReturn(1L);
        when(store.getName()).thenReturn("MCM 강남점");
        when(storeRepository.findById(1L)).thenReturn(Optional.of(store));
        when(reservationRepository.save(any(Reservation.class))).thenAnswer(inv -> inv.getArgument(0));

        var response = reservationService.create(1L, 1L, new CreateReservationRequest(
            1L, LocalDateTime.of(2026, 9, 1, 14, 0), List.of(CareRequestItemType.LEATHER_CLEANING)));

        assertThat(response.storeName()).isEqualTo("MCM 강남점");
        assertThat(response.requestItems()).containsExactly(CareRequestItemType.LEATHER_CLEANING);
        assertThat(response.status()).isEqualTo(ReservationStatus.REQUESTED);
    }

    @Test
    void createTranslatesUniqueViolationToSlotAlreadyBooked() {
        reservationService = newService();
        when(passportOwnershipGuard.getOwnedActivePassport(1L, 1L)).thenReturn(mock(Passport.class));
        Store store = storeWithHours();
        when(storeRepository.findById(1L)).thenReturn(Optional.of(store));
        when(reservationRepository.save(any(Reservation.class)))
            .thenThrow(new org.springframework.dao.DataIntegrityViolationException("dup"));

        assertThatThrownBy(() -> reservationService.create(1L, 1L, new CreateReservationRequest(
                1L, LocalDateTime.of(2026, 9, 1, 14, 0), List.of(CareRequestItemType.OTHER))))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.SLOT_ALREADY_BOOKED);
    }

    @Test
    void cancelIsIdempotentOnAlreadyCancelledReservation() {
        reservationService = newService();
        Reservation reservation = new Reservation(1L, 1L, LocalDateTime.of(2026, 9, 1, 14, 0),
            List.of(CareRequestItemType.OTHER.name()));
        reservation.cancel();
        when(reservationRepository.findById(5L)).thenReturn(Optional.of(reservation));
        when(passportOwnershipGuard.getOwnedActivePassport(1L, 1L)).thenReturn(mock(Passport.class));

        reservationService.cancel(5L, 1L);

        assertThat(reservation.getStatus()).isEqualTo(ReservationStatus.CANCELLED);
    }

    @Test
    void cancelThrowsNotFoundWhenReservationMissing() {
        reservationService = newService();
        when(reservationRepository.findById(999L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> reservationService.cancel(999L, 1L))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.RESERVATION_NOT_FOUND);
    }

    @Test
    void getAvailableSlotsExcludesBookedAndPastSlots() {
        reservationService = newService();
        Store store = storeWithHours();
        when(storeRepository.findById(1L)).thenReturn(Optional.of(store));
        Reservation booked = new Reservation(1L, 1L, LocalDateTime.of(2026, 9, 1, 11, 0),
            List.of(CareRequestItemType.OTHER.name()));
        when(reservationRepository.findAllByStoreIdAndSlotDateTimeBetweenAndStatus(
                eq(1L), any(), any(), eq(ReservationStatus.REQUESTED)))
            .thenReturn(List.of(booked));

        var slots = reservationService.getAvailableSlots(1L, java.time.LocalDate.of(2026, 9, 1));

        // storeWithHours()는 10:00~13:00, 60분 슬롯 → 그리드는 10/11/12시. 11시는 이미 예약됨.
        assertThat(slots).containsExactly(
            LocalDateTime.of(2026, 9, 1, 10, 0),
            LocalDateTime.of(2026, 9, 1, 12, 0));
    }

    private Store storeWithHours() {
        Store store = Mockito.mock(Store.class);
        when(store.getBusinessHoursStart()).thenReturn(LocalTime.of(10, 0));
        when(store.getBusinessHoursEnd()).thenReturn(LocalTime.of(13, 0));
        when(store.getSlotLengthMinutes()).thenReturn(60);
        return store;
    }

    private ReservationService newService() {
        return new ReservationService(reservationRepository, storeRepository, passportOwnershipGuard, FIXED_CLOCK);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew test --tests "com.mcm.passport.reservation.ReservationServiceTest"`
Expected: FAIL to compile — `ReservationService`/DTOs don't exist.

- [ ] **Step 3: Write the request DTO**

```java
package com.mcm.passport.reservation.dto;

import com.mcm.passport.reservation.CareRequestItemType;
import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDateTime;
import java.util.List;

public record CreateReservationRequest(
    @NotNull Long storeId,
    @NotNull @Future LocalDateTime slotDateTime,
    @NotNull @Size(min = 1) List<CareRequestItemType> requestItems
) {
}
```

- [ ] **Step 4: Write the response DTO**

```java
package com.mcm.passport.reservation.dto;

import com.mcm.passport.reservation.CareRequestItemType;
import com.mcm.passport.reservation.Reservation;
import com.mcm.passport.reservation.ReservationStatus;

import java.time.LocalDateTime;
import java.util.List;

public record ReservationResponse(
    Long id, Long passportId, Long storeId, String storeName, LocalDateTime slotDateTime,
    List<CareRequestItemType> requestItems, ReservationStatus status, LocalDateTime createdAt
) {
    public static ReservationResponse from(Reservation reservation, String storeName) {
        return new ReservationResponse(
            reservation.getId(), reservation.getPassportId(), reservation.getStoreId(), storeName,
            reservation.getSlotDateTime(),
            reservation.getRequestItems().stream().map(CareRequestItemType::valueOf).toList(),
            reservation.getStatus(), reservation.getCreatedAt());
    }
}
```

- [ ] **Step 5: Write the service**

```java
package com.mcm.passport.reservation;

import com.mcm.passport.common.exception.ApiException;
import com.mcm.passport.common.exception.ErrorCode;
import com.mcm.passport.reservation.dto.CreateReservationRequest;
import com.mcm.passport.reservation.dto.ReservationResponse;
import com.mcm.passport.store.Store;
import com.mcm.passport.store.StoreRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional
public class ReservationService {

    private final ReservationRepository reservationRepository;
    private final StoreRepository storeRepository;
    private final com.mcm.passport.passport.PassportOwnershipGuard passportOwnershipGuard;
    private final Clock clock;

    public ReservationResponse create(Long passportId, Long requesterAccountId, CreateReservationRequest request) {
        passportOwnershipGuard.getOwnedActivePassport(passportId, requesterAccountId);
        Store store = storeRepository.findById(request.storeId())
            .orElseThrow(() -> new ApiException(ErrorCode.STORE_NOT_FOUND));
        if (!SlotGridCalculator.isValidSlot(store, request.slotDateTime())) {
            throw new ApiException(ErrorCode.INVALID_SLOT_TIME);
        }
        Reservation reservation = new Reservation(passportId, store.getId(), request.slotDateTime(),
            request.requestItems().stream().map(Enum::name).toList());
        try {
            return ReservationResponse.from(reservationRepository.save(reservation), store.getName());
        } catch (DataIntegrityViolationException e) {
            throw new ApiException(ErrorCode.SLOT_ALREADY_BOOKED);
        }
    }

    public Page<ReservationResponse> list(Long passportId, Long requesterAccountId, Pageable pageable) {
        passportOwnershipGuard.getOwnedActivePassport(passportId, requesterAccountId);
        return reservationRepository.findAllByPassportIdOrderBySlotDateTimeDesc(passportId, pageable)
            .map(this::toResponseWithStoreLookup);
    }

    public ReservationResponse getDetail(Long reservationId, Long requesterAccountId) {
        return toResponseWithStoreLookup(getOwnedReservation(reservationId, requesterAccountId));
    }

    public void cancel(Long reservationId, Long requesterAccountId) {
        getOwnedReservation(reservationId, requesterAccountId).cancel();
    }

    public List<LocalDateTime> getAvailableSlots(Long storeId, LocalDate date) {
        Store store = storeRepository.findById(storeId)
            .orElseThrow(() -> new ApiException(ErrorCode.STORE_NOT_FOUND));
        LocalDateTime dayStart = date.atStartOfDay();
        LocalDateTime dayEnd = dayStart.plusDays(1);
        List<LocalDateTime> booked = reservationRepository
            .findAllByStoreIdAndSlotDateTimeBetweenAndStatus(storeId, dayStart, dayEnd, ReservationStatus.REQUESTED)
            .stream().map(Reservation::getSlotDateTime).toList();
        LocalDateTime now = LocalDateTime.now(clock);
        return SlotGridCalculator.gridFor(store, date).stream()
            .filter(slot -> !booked.contains(slot))
            .filter(slot -> slot.isAfter(now))
            .toList();
    }

    private Reservation getOwnedReservation(Long reservationId, Long requesterAccountId) {
        Reservation reservation = reservationRepository.findById(reservationId)
            .orElseThrow(() -> new ApiException(ErrorCode.RESERVATION_NOT_FOUND));
        passportOwnershipGuard.getOwnedActivePassport(reservation.getPassportId(), requesterAccountId);
        return reservation;
    }

    private ReservationResponse toResponseWithStoreLookup(Reservation reservation) {
        String storeName = storeRepository.findById(reservation.getStoreId())
            .map(Store::getName).orElse(null);
        return ReservationResponse.from(reservation, storeName);
    }
}
```

Constructor field order is `(ReservationRepository, StoreRepository, PassportOwnershipGuard, Clock)`, matching the test's `newService()` helper from Step 1.

- [ ] **Step 6: Run test to verify it passes**

Run: `./gradlew test --tests "com.mcm.passport.reservation.ReservationServiceTest"`
Expected: PASS (8 tests)

- [ ] **Step 7: Commit**

```bash
git add src/main/java/com/mcm/passport/reservation/dto/CreateReservationRequest.java \
        src/main/java/com/mcm/passport/reservation/dto/ReservationResponse.java \
        src/main/java/com/mcm/passport/reservation/ReservationService.java \
        src/test/java/com/mcm/passport/reservation/ReservationServiceTest.java
git commit -m "feat: add ReservationService (create/list/detail/cancel/available-slots)"
```

---

### Task 6: Reservation controller

**Files:**
- Create: `src/main/java/com/mcm/passport/reservation/ReservationController.java`
- Test: `src/test/java/com/mcm/passport/reservation/ReservationControllerIntegrationTest.java`

**Interfaces:**
- Consumes: `ReservationService` (Task 5), `CurrentAccount.id(Authentication)` (existing, same as every other controller).
- Produces: `POST /api/passports/{passportId}/reservations`, `GET /api/passports/{passportId}/reservations`, `GET /api/reservations/{id}`, `PATCH /api/reservations/{id}/cancel`, `GET /api/stores/{storeId}/available-slots?date=`.

- [ ] **Step 1: Write the failing integration test**

```java
package com.mcm.passport.reservation;

import com.mcm.passport.account.Account;
import com.mcm.passport.account.AccountRepository;
import com.mcm.passport.common.security.JwtTokenProvider;
import com.mcm.passport.passport.Passport;
import com.mcm.passport.passport.PassportRepository;
import com.mcm.passport.passport.UsageFrequency;
import com.mcm.passport.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDate;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
class ReservationControllerIntegrationTest extends AbstractIntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private AccountRepository accountRepository;
    @Autowired private PassportRepository passportRepository;
    @Autowired private JwtTokenProvider jwtTokenProvider;

    @Test
    void fullCreateListDetailCancelFlow() throws Exception {
        Account account = accountRepository.save(new Account("res-flow@example.com", "hash", "닉네임"));
        String token = jwtTokenProvider.generateToken(account.getId());
        Passport passport = passportRepository.save(new Passport("A1234", 2024, account.getId(),
            "Nomad Backpack", "애칭", LocalDate.of(2024, 1, 1), "MCM 강남점", null, false,
            java.util.List.of(), UsageFrequency.DAILY));

        String createBody = """
            {"storeId": 1, "slotDateTime": "2026-09-01T14:00:00", "requestItems": ["LEATHER_CLEANING"]}
            """;

        String createResponse = mockMvc.perform(post("/api/passports/" + passport.getId() + "/reservations")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(createBody))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.status").value("REQUESTED"))
            .andExpect(jsonPath("$.storeName").isNotEmpty())
            .andReturn().getResponse().getContentAsString();

        Long reservationId = com.jayway.jsonpath.JsonPath.read(createResponse, "$.id") instanceof Integer i
            ? i.longValue() : (Long) com.jayway.jsonpath.JsonPath.read(createResponse, "$.id");

        mockMvc.perform(get("/api/passports/" + passport.getId() + "/reservations")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content.length()").value(1));

        mockMvc.perform(get("/api/reservations/" + reservationId)
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("REQUESTED"));

        mockMvc.perform(patch("/api/reservations/" + reservationId + "/cancel")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isNoContent());

        // 멱등 — 다시 취소해도 에러 없이 204
        mockMvc.perform(patch("/api/reservations/" + reservationId + "/cancel")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isNoContent());
    }

    @Test
    void secondBookingOfSameSlotReturns409() throws Exception {
        Account account = accountRepository.save(new Account("res-dup@example.com", "hash", "닉네임"));
        String token = jwtTokenProvider.generateToken(account.getId());
        Passport passportA = passportRepository.save(new Passport("A1234", 2024, account.getId(),
            "Nomad Backpack", "애칭", LocalDate.of(2024, 1, 1), "MCM 강남점", null, false,
            java.util.List.of(), UsageFrequency.DAILY));
        Passport passportB = passportRepository.save(new Passport("B5678", 2024, account.getId(),
            "Nomad Tote", "애칭2", LocalDate.of(2024, 1, 1), "MCM 강남점", null, false,
            java.util.List.of(), UsageFrequency.DAILY));

        String body = """
            {"storeId": 1, "slotDateTime": "2026-09-02T11:00:00", "requestItems": ["OTHER"]}
            """;

        mockMvc.perform(post("/api/passports/" + passportA.getId() + "/reservations")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isCreated());

        // 같은 계정이 소유한 '다른' 여권으로 같은 매장·같은 시각 재요청 — 슬롯 정원이 여권이 아니라
        // 매장+시각 기준이라 여기서도 막혀야 한다(스펙 문서 4절 참고).
        mockMvc.perform(post("/api/passports/" + passportB.getId() + "/reservations")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("SLOT_ALREADY_BOOKED"));
    }

    @Test
    void availableSlotsExcludesAlreadyBookedTime() throws Exception {
        Account account = accountRepository.save(new Account("res-slots@example.com", "hash", "닉네임"));
        String token = jwtTokenProvider.generateToken(account.getId());
        Passport passport = passportRepository.save(new Passport("C9999", 2024, account.getId(),
            "Nomad Backpack", "애칭", LocalDate.of(2024, 1, 1), "MCM 강남점", null, false,
            java.util.List.of(), UsageFrequency.DAILY));
        String body = """
            {"storeId": 1, "slotDateTime": "2026-09-03T10:00:00", "requestItems": ["OTHER"]}
            """;
        mockMvc.perform(post("/api/passports/" + passport.getId() + "/reservations")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isCreated());

        mockMvc.perform(get("/api/stores/1/available-slots")
                .param("date", "2026-09-03")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[?(@ == '2026-09-03T10:00:00')]").doesNotExist());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew test --tests "com.mcm.passport.reservation.ReservationControllerIntegrationTest"`
Expected: FAIL to compile — `ReservationController` doesn't exist.

- [ ] **Step 3: Write the controller**

```java
package com.mcm.passport.reservation;

import com.mcm.passport.common.security.CurrentAccount;
import com.mcm.passport.reservation.dto.CreateReservationRequest;
import com.mcm.passport.reservation.dto.ReservationResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@RestController
@RequiredArgsConstructor
public class ReservationController {

    private final ReservationService reservationService;

    @PostMapping("/api/passports/{passportId}/reservations")
    public ResponseEntity<ReservationResponse> create(
            Authentication authentication, @PathVariable Long passportId,
            @Valid @RequestBody CreateReservationRequest request) {
        ReservationResponse response = reservationService.create(
            passportId, CurrentAccount.id(authentication), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping("/api/passports/{passportId}/reservations")
    public ResponseEntity<Page<ReservationResponse>> list(
            Authentication authentication, @PathVariable Long passportId,
            @PageableDefault(size = 20) Pageable pageable) {
        return ResponseEntity.ok(
            reservationService.list(passportId, CurrentAccount.id(authentication), pageable));
    }

    @GetMapping("/api/reservations/{id}")
    public ResponseEntity<ReservationResponse> getDetail(Authentication authentication, @PathVariable Long id) {
        return ResponseEntity.ok(reservationService.getDetail(id, CurrentAccount.id(authentication)));
    }

    @PatchMapping("/api/reservations/{id}/cancel")
    public ResponseEntity<Void> cancel(Authentication authentication, @PathVariable Long id) {
        reservationService.cancel(id, CurrentAccount.id(authentication));
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/api/stores/{storeId}/available-slots")
    public ResponseEntity<List<LocalDateTime>> getAvailableSlots(
            @PathVariable Long storeId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return ResponseEntity.ok(reservationService.getAvailableSlots(storeId, date));
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./gradlew test --tests "com.mcm.passport.reservation.ReservationControllerIntegrationTest"`
Expected: PASS (3 tests). If `com.jayway.jsonpath.JsonPath` isn't resolvable, it's already a transitive dependency of `spring-boot-starter-test` (via `json-path`) — used elsewhere in this codebase's controller tests, so no `build.gradle` change should be needed; if it genuinely fails to resolve, check how an existing test (e.g. `PassportControllerIntegrationTest`) extracts an id from a JSON response and copy that approach instead.

- [ ] **Step 5: Commit**

```bash
git add src/main/java/com/mcm/passport/reservation/ReservationController.java \
        src/test/java/com/mcm/passport/reservation/ReservationControllerIntegrationTest.java
git commit -m "feat: add Reservation REST API"
```

---

### Task 7: Timeline integration

**Files:**
- Modify: `src/main/java/com/mcm/passport/timeline/TimelineService.java`
- Modify: `src/test/java/com/mcm/passport/timeline/TimelineServiceTest.java`

**Interfaces:**
- Consumes: `ReservationRepository.findAllByPassportId(Long)` (Task 3), `StoreRepository.findById(Long)` (Task 1).
- Produces: `TimelineService.getTimeline(...)` now also emits `TimelineItem`s with `type="RESERVATION"`.

- [ ] **Step 1: Write the failing unit test**

Add this test to `src/test/java/com/mcm/passport/timeline/TimelineServiceTest.java` (alongside the existing `getTimelineReturnsItemsSortedByDate`):

```java
    @Test
    void getTimelineIncludesReservations() {
        timelineService = newService();
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.DAILY);
        when(passportOwnershipGuard.getOwnedActivePassport(1L, 1L)).thenReturn(passport);
        when(diagnosisRepository.findAllByPassportId(1L)).thenReturn(List.of());
        when(careRecordRepository.findAllByPassportId(1L)).thenReturn(List.of());
        when(notificationRepository.findAllByPassportIdAndReadTrue(1L)).thenReturn(List.of());
        when(timelineEventRepository.findAllByPassportId(1L)).thenReturn(List.of());
        com.mcm.passport.reservation.Reservation reservation = new com.mcm.passport.reservation.Reservation(
            1L, 1L, java.time.LocalDateTime.of(2026, 9, 1, 14, 0),
            List.of(com.mcm.passport.reservation.CareRequestItemType.LEATHER_CLEANING.name()));
        when(reservationRepository.findAllByPassportId(1L)).thenReturn(List.of(reservation));
        com.mcm.passport.store.Store store = mock(com.mcm.passport.store.Store.class);
        when(store.getName()).thenReturn("MCM 강남점");
        when(storeRepository.findById(1L)).thenReturn(java.util.Optional.of(store));

        var items = timelineService.getTimeline(1L, 1L);

        assertThat(items).hasSize(2); // REGISTRATION + RESERVATION
        var reservationItem = items.stream().filter(i -> i.type().equals("RESERVATION")).findFirst().orElseThrow();
        assertThat(reservationItem.occurredAt()).isEqualTo(java.time.LocalDateTime.of(2026, 9, 1, 14, 0));
        assertThat(reservationItem.detail().get("storeName")).isEqualTo("MCM 강남점");
        assertThat(reservationItem.detail().get("status")).isEqualTo("REQUESTED");
    }
```

Add the two new mocks near the existing `@Mock` fields at the top of the class:

```java
    @Mock private com.mcm.passport.reservation.ReservationRepository reservationRepository;
    @Mock private com.mcm.passport.store.StoreRepository storeRepository;
```

And update `newService()` to pass them (exact new constructor order defined in Step 3 below):

```java
    private TimelineService newService() {
        return new TimelineService(timelineEventRepository, diagnosisRepository,
            careRecordRepository, notificationRepository, reservationRepository, storeRepository,
            imageStorageService, passportOwnershipGuard);
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew test --tests "com.mcm.passport.timeline.TimelineServiceTest"`
Expected: FAIL to compile — `TimelineService`'s constructor doesn't have 8 params yet, and other pre-existing tests in this file will also fail to compile until Step 3 is done (that's expected — this is a whole-class constructor signature change, all tests in the file are affected simultaneously).

- [ ] **Step 3: Modify `TimelineService`**

In `src/main/java/com/mcm/passport/timeline/TimelineService.java`, add the two new fields (`ReservationRepository`, `StoreRepository`) and the new source in `getTimeline()`:

```java
import com.mcm.passport.reservation.ReservationRepository;
import com.mcm.passport.store.Store;
import com.mcm.passport.store.StoreRepository;
```

```java
    private final TimelineEventRepository timelineEventRepository;
    private final DiagnosisRepository diagnosisRepository;
    private final CareRecordRepository careRecordRepository;
    private final NotificationRepository notificationRepository;
    private final ReservationRepository reservationRepository;
    private final StoreRepository storeRepository;
    private final ImageStorageService imageStorageService;
    private final PassportOwnershipGuard passportOwnershipGuard;
```

In `getTimeline()`, add this block after the existing `timelineEventRepository...forEach(...)` block and before `items.sort(...)`:

```java
        // CANCELLED로 바뀐 예약도 사라지지 않고 상태값 그대로 노출한다 — 다른 소스가 이력을
        // 숨기지 않는 것과 같은 원칙(스펙 문서 6절 참고).
        reservationRepository.findAllByPassportId(passportId).forEach(r -> {
            String storeName = storeRepository.findById(r.getStoreId())
                .map(Store::getName).orElse("");
            items.add(new com.mcm.passport.timeline.dto.TimelineItem(
                "RESERVATION", r.getId(), r.getSlotDateTime(),
                java.util.Map.of(
                    "storeName", storeName,
                    "requestItems", r.getRequestItems(),
                    "status", r.getStatus().name())));
        });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./gradlew test --tests "com.mcm.passport.timeline.TimelineServiceTest"`
Expected: PASS (all tests in the file, including the new one)

- [ ] **Step 5: Commit**

```bash
git add src/main/java/com/mcm/passport/timeline/TimelineService.java \
        src/test/java/com/mcm/passport/timeline/TimelineServiceTest.java
git commit -m "feat: add reservations to the unified passport timeline"
```

---

### Task 8: Cancel pending reservations on passport delete

**Files:**
- Modify: `src/main/java/com/mcm/passport/passport/PassportService.java`
- Modify: `src/test/java/com/mcm/passport/passport/PassportServiceTest.java`

**Interfaces:**
- Consumes: `ReservationRepository.cancelAllRequestedForPassport(Long)` (Task 3).

- [ ] **Step 1: Write the failing unit test**

Add to `src/test/java/com/mcm/passport/passport/PassportServiceTest.java`, next to `deleteSoftDeletesPassport`:

```java
    @Test
    void deleteCancelsPendingReservationsForThatPassport() {
        passportService = newService();
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.RARE);
        when(passportOwnershipGuard.getOwnedActivePassport(1L, 1L)).thenReturn(passport);

        passportService.delete(1L, 1L);

        verify(reservationRepository).cancelAllRequestedForPassport(1L);
    }
```

Add the mock field:

```java
    @Mock private com.mcm.passport.reservation.ReservationRepository reservationRepository;
```

Update `newService()` (exact new constructor order defined in Step 3 below):

```java
    private PassportService newService() {
        return new PassportService(passportRepository, imageStorageService, diagnosisRepository,
            accountService, passportOwnershipGuard, reservationRepository, fixedClock);
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew test --tests "com.mcm.passport.passport.PassportServiceTest"`
Expected: FAIL — `verify(reservationRepository).cancelAllRequestedForPassport(1L)` never happens (and the file won't compile until the mock field/constructor call are added, same as Task 7's note).

- [ ] **Step 3: Modify `PassportService`**

```java
import com.mcm.passport.reservation.ReservationRepository;
```

```java
    private final ReservationRepository reservationRepository;
```

(add as a new constructor parameter — place it after `passportOwnershipGuard` and before `clock`, matching the test's `newService()` order above)

```java
    public void delete(Long passportId, Long requesterAccountId) {
        Passport passport = getOwnedActivePassport(passportId, requesterAccountId);
        passport.softDelete();
        reservationRepository.cancelAllRequestedForPassport(passportId);
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./gradlew test --tests "com.mcm.passport.passport.PassportServiceTest"`
Expected: PASS (all tests in the file)

- [ ] **Step 5: Commit**

```bash
git add src/main/java/com/mcm/passport/passport/PassportService.java \
        src/test/java/com/mcm/passport/passport/PassportServiceTest.java
git commit -m "fix: cancel pending reservations when a passport is deleted"
```

---

### Task 9: Cancel pending reservations on account withdrawal

**Files:**
- Modify: `src/main/java/com/mcm/passport/account/AccountService.java`
- Modify: `src/test/java/com/mcm/passport/account/AccountServiceTest.java`

**Interfaces:**
- Consumes: `ReservationRepository.cancelAllRequestedForPassport(Long)` (Task 3).

- [ ] **Step 1: Write the failing unit test**

Add to `src/test/java/com/mcm/passport/account/AccountServiceTest.java`, next to `withdrawCascadesToOwnedPassports`:

```java
    @Test
    void withdrawCascadesToReservationsOfEachDeletedPassport() {
        AccountService service = newService();
        Account account = new Account("user@example.com", "hash", "닉네임");
        when(accountRepository.findById(1L)).thenReturn(java.util.Optional.of(account));
        com.mcm.passport.passport.Passport passport = new com.mcm.passport.passport.Passport(
            "A1234", 2024, 1L, "Nomad Backpack", "애칭",
            java.time.LocalDate.of(2024, 1, 1), "MCM 강남점", null, false,
            java.util.List.of(), com.mcm.passport.passport.UsageFrequency.DAILY);
        when(passportRepository.findIdsByOwnerAccountId(1L)).thenReturn(java.util.List.of(42L));
        when(passportRepository.findByIdAndStatusForUpdate(eq(42L), eq(com.mcm.passport.passport.PassportStatus.ACTIVE)))
            .thenReturn(java.util.Optional.of(passport));

        service.withdraw(1L);

        verify(reservationRepository).cancelAllRequestedForPassport(42L);
    }
```

Add the mock field:

```java
    @Mock private com.mcm.passport.reservation.ReservationRepository reservationRepository;
```

The existing `newService()` helper (near the bottom of the file) currently reads:

```java
    private AccountService newService() {
        return new AccountService(accountRepository, passwordResetTokenRepository,
            passwordEncoder, jwtTokenProvider(), passwordResetMailer, passportRepository, fixedClock);
    }
```

Note `jwtTokenProvider()` is a method call (builds a real `JwtTokenProvider`), not a `@Mock` field — don't change that part. Add `reservationRepository` right before `fixedClock`:

```java
    private AccountService newService() {
        return new AccountService(accountRepository, passwordResetTokenRepository,
            passwordEncoder, jwtTokenProvider(), passwordResetMailer, passportRepository,
            reservationRepository, fixedClock);
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew test --tests "com.mcm.passport.account.AccountServiceTest"`
Expected: FAIL — `cancelAllRequestedForPassport(42L)` never gets called (and compile fails until Step 3's constructor change lands, consistent with Tasks 7–8).

- [ ] **Step 3: Modify `AccountService`**

```java
import com.mcm.passport.reservation.ReservationRepository;
```

```java
    private final ReservationRepository reservationRepository;
```

(add as a new constructor field, placed right before `clock`, matching the test's `newService()` order above)

```java
        passportRepository.findIdsByOwnerAccountId(accountId)
            .forEach(passportId -> passportRepository.findByIdAndStatusForUpdate(
                    passportId, com.mcm.passport.passport.PassportStatus.ACTIVE)
                .filter(p -> p.isOwnedBy(accountId))
                .ifPresent(p -> {
                    p.softDelete();
                    reservationRepository.cancelAllRequestedForPassport(p.getId());
                }));
```

(This replaces the previous `.ifPresent(com.mcm.passport.passport.Passport::softDelete)` method-reference with the lambda block above — the method reference can no longer express "also cancel reservations", so it becomes an explicit lambda.)

- [ ] **Step 4: Run test to verify it passes**

Run: `./gradlew test --tests "com.mcm.passport.account.AccountServiceTest"`
Expected: PASS (all tests in the file)

- [ ] **Step 5: Commit**

```bash
git add src/main/java/com/mcm/passport/account/AccountService.java \
        src/test/java/com/mcm/passport/account/AccountServiceTest.java
git commit -m "fix: cancel pending reservations when an account withdraws"
```

---

### Task 10: Full regression run

**Files:** none (verification only)

- [ ] **Step 1: Run the entire test suite**

Run: `./gradlew test`
Expected: `BUILD SUCCESSFUL`, all tests pass (existing 140 + this plan's new tests). If anything fails, treat it with the `superpowers:systematic-debugging` skill's Phase 1 (root cause) before touching any code — do not guess-fix.

- [ ] **Step 2: Spot-check the four new `ErrorCode` entries are wired into `GlobalExceptionHandler`'s contract**

`GlobalExceptionHandler` already handles all `ApiException`s generically via `e.getErrorCode()` (see `handleApiException`) — no per-code changes are needed there. Confirm this by grep, not by re-reading the whole file:

Run: `grep -n "STORE_NOT_FOUND\|RESERVATION_NOT_FOUND\|SLOT_ALREADY_BOOKED\|INVALID_SLOT_TIME" src/main/java/com/mcm/passport/common/exception/GlobalExceptionHandler.java`
Expected: no output (confirms nothing needed adding there — the generic handler already covers it).

- [ ] **Step 3: Update the frontend-facing API spec doc**

Add a new section to `MCM_Nomad_Passport_API명세서_프론트엔드용.md` (repo root) documenting the 7 new endpoints (`/api/stores`, `/api/stores/{id}`, `/api/stores/{storeId}/available-slots`, `/api/passports/{passportId}/reservations` POST/GET, `/api/reservations/{id}`, `/api/reservations/{id}/cancel`), following the same format as the existing sections (request/response JSON examples, error codes, enum table). This wasn't part of the spec's backend scope but the doc will otherwise silently go stale the moment this ships.

- [ ] **Step 4: Commit the doc update**

```bash
git add "MCM_Nomad_Passport_API명세서_프론트엔드용.md"
git commit -m "docs: add reservation API to the frontend spec"
```

---

## Self-Review Notes

- **Spec coverage:** Store entity+seed (Task 1–2), Reservation entity+unique-constraint (Task 3), slot grid computation incl. trailing-partial-slot rule (Task 4), full CRUD+cancel API incl. `SLOT_ALREADY_BOOKED`/`INVALID_SLOT_TIME`/idempotent-cancel (Task 5–6), timeline integration (Task 7), delete/withdraw cascade on both call sites (Task 8–9), cross-passport-same-account double-booking behavior is asserted in Task 6's `secondBookingOfSameSlotReturns409`, available-slots excludes booked+past times (Task 5's unit test + Task 6's integration test) — every spec section has a task.
- **Not covered by design (intentionally, per spec §10 YAGNI):** per-weekday store hours, reservation→notification triggers, `COMPLETED` status, free-text requests. No task needed.
- **Known accepted race** (spec §5): the narrow cancel/rebook window isn't tested or fixed — matches the spec's explicit decision to leave it, same treatment as `TransferCode.generateCode()`.
