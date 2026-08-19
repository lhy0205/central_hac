# MCM Nomad Passport — 프론트엔드용 API 명세서

담당: 정준영(백엔드) → 심지윤(프론트엔드)
기준 커밋: `96ed8ef` (feat: add password-change and notification-preferences APIs)

## 0. 공통 사항

### Base URL
- 로컬 개발: `http://localhost:8080`
- `server.port`/`context-path` 커스텀 설정 없음 → 모든 엔드포인트는 `/api`로 시작

### 인증
- 로그인 성공 시 발급되는 `accessToken`을 이후 모든 요청에 헤더로 첨부:
  ```
  Authorization: Bearer <accessToken>
  ```
- 토큰 만료: 24시간 (`jwt.expiration-ms: 86400000`)
- 인증 불필요(permitAll): `/api/auth/**`, `/api/health`
- **그 외 전 엔드포인트는 인증 필수** — 여권 승계 코드 미리보기/redeem 포함 (얼핏 공개 플로우처럼 보이지만 로그인 필요)
- 탈퇴(`DELETE /account/me`)한 계정의 토큰은 서명이 유효해도 매 요청마다 거부됨 (계정 활성 상태 재검증)
- 인증 실패(토큰 없음/무효) 응답: `401` + `{"code":"UNAUTHORIZED","message":"인증이 필요합니다."}`

### 공통 에러 응답 포맷
모든 4xx/5xx 응답은 동일한 형태:
```json
{ "code": "ERROR_CODE", "message": "사람이 읽을 수 있는 메시지" }
```

| code | HTTP status | 설명 |
|---|---|---|
| VALIDATION_ERROR | 400 | 요청 바디 검증 실패, 타입 불일치, 파라미터 누락, multipart part 누락, 파일 크기 초과 등 |
| EMAIL_ALREADY_EXISTS | 409 | 회원가입 시 이메일 중복 |
| INVALID_CREDENTIALS | 401 | 로그인 실패 |
| UNAUTHORIZED | 401 | 인증 필요/토큰 무효 |
| RESET_TOKEN_INVALID | 400 | 비밀번호 재설정 토큰 무효 |
| INVALID_SERIAL_FORMAT | 400 | 시리얼번호 형식 오류 |
| SERIAL_ALREADY_REGISTERED | 409 | 이미 등록된 시리얼번호 |
| PASSPORT_NOT_FOUND | 404 | 여권 없음 |
| FORBIDDEN | 403 | 본인 소유가 아닌 리소스 접근 |
| IMAGE_UPLOAD_FAILED | 502 | Cloudinary 업로드 실패 |
| DIAGNOSIS_NOT_FOUND | 404 | 진단 기록 없음 |
| CARE_RECORD_NOT_FOUND | 404 | 케어 기록 없음 |
| TIMELINE_EVENT_NOT_FOUND | 404 | 타임라인 이벤트 없음 |
| NOTIFICATION_NOT_FOUND | 404 | 알림 없음 |
| ACCOUNT_NOT_FOUND | 404 | 계정 없음 |
| INVALID_TRANSFER_CODE_FORMAT | 400 | 승계 코드 형식 오류 |
| TRANSFER_CODE_EXPIRED_OR_USED | 400 | 승계 코드 만료/이미 사용됨 |
| CANNOT_TRANSFER_TO_SELF | 400 | 본인에게 승계 시도 |
| TRANSFER_CODE_ISSUE_FAILED | 409 | 승계 코드 발급 충돌 |
| INVALID_CURRENT_PASSWORD | 400 | 비밀번호 변경 시 현재 비밀번호 불일치 |
| INTERNAL_ERROR | 500 | 서버 내부 오류 |

### 파일 업로드
- multipart part로 이미지 업로드하는 모든 엔드포인트: `consumes = multipart/form-data`
- 이미지 1장당 최대 **10MB**, 요청 전체 최대 **50MB**
- 이미지는 Cloudinary에 저장되며, 응답에는 Cloudinary URL 문자열로 내려감

### 페이지네이션
- `Page<T>`를 반환하는 엔드포인트는 Spring 표준 `Pageable` 쿼리 파라미터 사용: `?page=0&size=20&sort=필드,asc`
- 기본 `size=20`

---

## 1. 계정 (Account) — `/api/auth`, `/api/account`

### POST `/api/auth/signup` (인증 불필요)
회원가입

요청 본문:
```json
{
  "email": "user@example.com",   // @Email @NotBlank
  "password": "string",          // @NotBlank, 8~100자
  "nickname": "string"           // @NotBlank
}
```
응답: `201 CREATED`
```json
{ "id": 1, "email": "user@example.com", "nickname": "string", "createdAt": "2026-08-13T12:00:00" }
```

### POST `/api/auth/login` (인증 불필요)
로그인

요청 본문:
```json
{ "email": "user@example.com", "password": "string" }
```
응답: `200 OK`
```json
{
  "accessToken": "eyJ...",
  "account": { "id": 1, "email": "user@example.com", "nickname": "string", "createdAt": "..." }
}
```
실패 시 `401 INVALID_CREDENTIALS`

### GET `/api/account/me` (인증 필요)
내 정보 조회 → `200 OK` + `AccountResponse` (signup 응답과 동일 형태)

### PATCH `/api/account/me` (인증 필요)
프로필 수정
```json
{ "nickname": "string" }  // @NotBlank
```
→ `200 OK` + `AccountResponse`

### DELETE `/api/account/me` (인증 필요)
회원 탈퇴 → `204 NO_CONTENT`

### PATCH `/api/account/me/password` (인증 필요)
로그인 상태에서 비밀번호 변경 (로그인 화면의 "비밀번호 찾기"용 재설정 플로우와는 별개 — 이건 마이페이지용)
```json
{
  "currentPassword": "string",  // @NotBlank
  "newPassword": "string"       // @NotBlank, 8~100자
}
```
→ `204 NO_CONTENT`
실패 시 `400 INVALID_CURRENT_PASSWORD` (현재 비밀번호 불일치)

### GET `/api/account/me/notification-preferences` (인증 필요)
알림 수신 설정 조회 → `200 OK`
```json
{ "careAlertsEnabled": true, "journeyAlertsEnabled": true, "marketingAlertsEnabled": false }
```

### PATCH `/api/account/me/notification-preferences` (인증 필요)
알림 수신 설정 변경 — 3개 필드 모두 필수(부분 업데이트 아님, 항상 3개 다 채워서 보낼 것)
```json
{
  "careAlertsEnabled": true,      // @NotNull
  "journeyAlertsEnabled": true,   // @NotNull
  "marketingAlertsEnabled": false // @NotNull
}
```
→ `200 OK` + 변경된 `NotificationPreferencesResponse` (조회 응답과 동일 형태)

> ⚠️ `careAlertsEnabled`를 끄면 해당 계정의 여권들에 대해 진단 후 자동 발생하는 `SELF_CARE`/`STORE_SERVICE` 알림(§6)과 미사용 리마인더 알림이 생성되지 않음. `journeyAlertsEnabled`/`marketingAlertsEnabled`는 현재 대응하는 알림 타입이 없어 실제로는 게이팅에 쓰이지 않음(백엔드 주석상 확인됨) — UI 토글은 그대로 두되 동작이 없다는 점 참고.

### POST `/api/auth/password-reset` (인증 불필요)
비밀번호 재설정 요청
```json
{ "email": "user@example.com" }
```
→ `204 NO_CONTENT`

### POST `/api/auth/password-reset/confirm` (인증 불필요)
```json
{ "token": "string", "newPassword": "string" }  // newPassword 8~100자
```
→ `204 NO_CONTENT` (토큰 무효 시 `400 RESET_TOKEN_INVALID`)

---

## 2. 여권 (Passport) — `/api/passports`

### POST `/api/passports` (인증 필요, multipart/form-data)
여권 등록

멀티파트 파트:
- `request` (JSON, 필수):
  ```json
  {
    "serialNumber": "string",     // @NotBlank
    "modelName": "string",        // @NotBlank
    "nickname": "string",         // 선택
    "purchaseDate": "2026-01-01", // @NotNull, 오늘 이전/오늘
    "purchasePlace": "string",    // 선택
    "usageFrequency": "DAILY"     // @NotNull — enum, 아래 참고
  }
  ```
- `receiptImage`: 파일 1개, 선택 (영수증 이미지)
- `baselineImages`: 파일 여러 개, 선택 (미첨부 시 빈 배열로 처리)

응답: `201 CREATED`
```json
{
  "id": 1, "serialNumber": "string", "purchaseYear": 2026, "modelName": "string",
  "nickname": "string", "purchaseDate": "2026-01-01", "purchasePlace": "string",
  "hasReceiptTag": true, "baselineImageUrls": ["https://..."],
  "usageFrequency": "DAILY", "status": "ACTIVE", "createdAt": "2026-08-13T12:00:00"
}
```
> `purchaseYear`는 서버가 `purchaseDate`에서 계산 — 요청에 별도로 보내지 않음.
> `receiptImageUrl`은 응답에 포함되지 않음(개인정보 보호 목적, 의도적 제외).

### GET `/api/passports` (인증 필요)
내 여권 목록 (페이지네이션) → `200 OK` + `Page<PassportSummaryResponse>`
```json
{
  "id": 1, "modelName": "string", "nickname": "string", "ownershipDays": 30,
  "overallGrade": "GOOD",          // 진단 이력 없으면 null
  "lastDiagnosedAt": "2026-08-01T00:00:00"  // 없으면 null
}
```

### GET `/api/passports/{id}` (인증 필요)
여권 상세 → `200 OK` + `PassportResponse` (등록 응답과 동일 형태)

### PATCH `/api/passports/{id}` (인증 필요)
```json
{ "nickname": "string", "usageFrequency": "DAILY" }  // 둘 다 선택, null이면 미변경
```
→ `200 OK` + `PassportResponse`

### DELETE `/api/passports/{id}` (인증 필요)
소프트 삭제 (`status`를 `DELETED`로 변경) → `204 NO_CONTENT`

**Enum**
- `UsageFrequency`: `DAILY`, `FEW_TIMES_A_WEEK`, `OCCASIONAL`, `RARE`
- `PassportStatus`: `ACTIVE`, `DELETED`

---

## 3. 진단 (Diagnosis) — `/api/passports/{passportId}/diagnoses`, `/api/diagnoses`

### POST `/api/passports/{passportId}/diagnoses` (인증 필요, multipart/form-data)
진단 제출 (마모 진단 이미지 업로드 → AI/규칙 엔진 실행)

파라미터:
- 쿼리/폼: `diagnosisType`: `SELF` | `STORE`
- 파트: `images` — 파일 여러 개 (List)

응답: `201 CREATED`
```json
{
  "id": 1, "diagnosisType": "SELF",
  "itemScores": { "마모": 25, "코팅벗겨짐": 20, "변색": 15, "부자재상태": 10 },
  "overallGrade": "GOOD",
  "evidenceText": "직전 마모 점수 20에서 25로 변화, 종합 등급 GOOD",
  "diagnosedAt": "2026-08-13T12:00:00",
  "previousItemScores": { "마모": 20, "코팅벗겨짐": 15, "변색": 10, "부자재상태": 5 }
}
```
> `previousItemScores`는 **제출 응답에서만** 채워짐(직전 진단과 비교용). 목록/상세 조회 응답에서는 항상 `null`.
> `itemScores`의 키 구성은 현재 규칙 기반 엔진 기준(`마모`,`코팅벗겨짐`,`변색`,`부자재상태`) — AI 파트 연동 후 바뀔 수 있음.

### GET `/api/passports/{passportId}/diagnoses` (인증 필요)
진단 이력 목록 (페이지네이션) → `200 OK` + `Page<DiagnosisResponse>` (`previousItemScores`는 `null`)

### GET `/api/diagnoses/{diagnosisId}` (인증 필요)
진단 상세 → `200 OK` + `DiagnosisResponse` (`previousItemScores`는 `null`)

**Enum**
- `DiagnosisType`: `SELF`, `STORE`
- `OverallGrade`: `GOOD`, `NEEDS_CARE`, `URGENT`

---

## 4. 케어 기록 (CareRecord) — `/api/passports/{passportId}/care-records`, `/api/care-records`

### POST `/api/passports/{passportId}/care-records` (인증 필요, multipart/form-data)
파트:
- `request` (JSON, 필수):
  ```json
  {
    "careType": "string",           // @NotBlank
    "materialType": "string",       // 선택
    "notes": "string",              // 선택
    "completedAt": "2026-08-13T10:00:00"  // 선택, 미래 시각 불가 (@PastOrPresent)
  }
  ```
- `image`: 파일 1개, 선택

응답: `201 CREATED`
```json
{
  "id": 1, "careType": "string", "materialType": "string", "notes": "string",
  "imageUrl": "https://...", "completedAt": "2026-08-13T10:00:00"
}
```

### GET `/api/passports/{passportId}/care-records` (인증 필요)
페이지네이션 → `200 OK` + `Page<CareRecordResponse>`

### GET `/api/care-records/{id}` (인증 필요)
→ `200 OK` + `CareRecordResponse`

---

## 5. 타임라인 (Timeline)

### POST `/api/passports/{passportId}/timeline/events` (인증 필요, multipart/form-data)
사용자 직접 기록 이벤트 생성

파트:
- `request` (JSON, 필수):
  ```json
  { "eventType": "MOMENT", "note": "string", "eventDate": "2026-08-13T10:00:00" }
  ```
  > ⚠️ `eventType`/`note`에 `@NotNull`/`@NotBlank`가 없음 — 서버 컬럼상 `eventType`은 NOT NULL이라 값 누락 시 400이 아닌 DB 오류로 튈 가능성 있음(백엔드에서 확인/수정 예정, 참고만 할 것). 프론트에서는 항상 값 채워서 보내는 걸 권장.
- `image`: 파일 1개, 선택

응답: `201 CREATED`
```json
{ "id": 1, "eventType": "MOMENT", "note": "string", "imageUrl": "https://...", "eventDate": "..." }
```

### GET `/api/timeline/events/{id}` (인증 필요) → `200 OK` + `TimelineEventResponse`

### PATCH `/api/timeline/events/{id}` (인증 필요)
```json
{ "note": "string" }
```
→ `200 OK` + `TimelineEventResponse` (note만 수정 가능)

### DELETE `/api/timeline/events/{id}` (인증 필요) → `204 NO_CONTENT`

**Enum** `TimelineEventType`: `MOMENT`, `STORE_VISIT`, `SELF_CARE`, `OTHER`

### GET `/api/passports/{passportId}/timeline` (인증 필요)
통합 타임라인 — 등록/진단/케어/알림(읽은 것만)/사용자 이벤트 4~5종을 합쳐 시간순 정렬한 리스트.

**⚠️ 페이지네이션 없음** — 전체를 한 번에 반환 (알려진 스케일링 제약, 의도적으로 보류됨). 아이템 수가 많은 계정에서는 응답이 커질 수 있음을 감안할 것.

응답: `200 OK` + `List<TimelineItem>`
```json
[{ "type": "REGISTRATION", "id": 1, "occurredAt": "...", "detail": { "modelName": "string" } }]
```

`type`별 `detail` 스키마:
| type | id 의미 | detail |
|---|---|---|
| REGISTRATION | passportId | `{ modelName }` |
| DIAGNOSIS | diagnosisId | `{ overallGrade, diagnosisType }` |
| CARE | careRecordId | `{ careType }` |
| NOTIFICATION | notificationId (읽음 처리된 것만 포함) | `{ type, message }` |
| USER_EVENT | timelineEventId | `{ eventType, note }` (note는 null이면 `""`) |

---

## 6. 알림 (Notification) — `/api/passports/{passportId}/notifications`, `/api/notifications`

### GET `/api/passports/{passportId}/notifications` (인증 필요)
페이지네이션 → `200 OK` + `Page<NotificationResponse>`
```json
{
  "id": 1, "type": "SELF_CARE", "reasonFactors": { "...": "..." },
  "message": "string", "overallScore": 40, "read": false, "dismissed": false,
  "createdAt": "2026-08-13T12:00:00"
}
```

### PATCH `/api/notifications/{id}/read` (인증 필요) → `204 NO_CONTENT`
### PATCH `/api/notifications/{id}/dismiss` (인증 필요) → `204 NO_CONTENT`

**Enum** `NotificationType`: `SELF_CARE`, `STORE_SERVICE`, `REPURCHASE`, `MILESTONE`

> 알림은 진단 제출 직후 서버 내부에서 조건 평가되어 자동 생성됨 (프론트에서 별도 생성 API 호출 불필요).

---

## 7. 여권 승계 (Transfer) — `/api/passports/...`

**⚠️ 아래 3개 엔드포인트 모두 인증 필요** (redeem/preview도 로그인 상태에서 호출해야 함 — 공개 URL처럼 오해하지 말 것)

### POST `/api/passports/{passportId}/transfer-code` (인증 필요, 원 소유자만)
```json
{ "code": "ABC123", "expiresAt": "2026-08-20T12:00:00" }
```

### GET `/api/passports/transfer/{code}/preview` (인증 필요)
승계 대상 미리보기
```json
{ "modelName": "string", "ownershipDays": 100, "overallGrade": "GOOD" }
```

### POST `/api/passports/transfer/redeem` (인증 필요)
```json
{ "code": "ABC123" }  // @NotBlank
```
→ `200 OK` + `PassportResponse` (소유권이 이전된 여권)

---

## 8. Health Check

### GET `/api/health` (인증 불필요)
→ `200 OK` `{ "status": "UP" }`

---

## 부록: 전체 Enum 요약

| Enum | 값 |
|---|---|
| UsageFrequency | DAILY, FEW_TIMES_A_WEEK, OCCASIONAL, RARE |
| PassportStatus | ACTIVE, DELETED |
| DiagnosisType | SELF, STORE |
| OverallGrade | GOOD, NEEDS_CARE, URGENT |
| TimelineEventType | MOMENT, STORE_VISIT, SELF_CARE, OTHER |
| NotificationType | SELF_CARE, STORE_SERVICE, REPURCHASE, MILESTONE |

## 미확정/변동 가능 항목 (참고)
- 진단 `itemScores`의 키 구성("마모","코팅벗겨짐","변색","부자재상태")은 현재 규칙 기반 임시 로직 기준이며, AI 파트(이현욱) 연동 완료 후 항목명/개수가 바뀔 수 있음 → 프론트는 `itemScores`를 고정 키가 아닌 `Map<String, Integer>`로 취급해 동적으로 렌더링하는 걸 권장.
- 통합 타임라인(`GET /api/passports/{id}/timeline`) 페이지네이션 미지원 — 추후 API 계약 변경 가능성 있음.
- 타임라인 이벤트 생성 시 `eventType`/`note` 검증 강화 여부 백엔드에서 확인 중.
