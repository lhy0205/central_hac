# 백엔드 도메인 모델 · 시스템 흐름 정리

ERD와 시스템 흐름도 최신화를 위해 **실제 구현된 코드와 마이그레이션에서 뽑아낸** 자료다.
기획서 도식화용이므로 스키마·상태·흐름을 있는 그대로 적었다.

기준: Flyway `V1`~`V15`, `src/main/java/com/mcm/passport/**`
관련 문서: [`NETWORKING.md`](./NETWORKING.md)(서버 간 통신), [`DEPLOY.md`](./DEPLOY.md)(배포)

---

## 1. ERD

### 1-1. 엔티티 관계 요약

```
account ──1:N──▶ passport ──1:N──▶ diagnosis
   │                 │
   │                 ├──1:N──▶ care_record
   │                 ├──1:N──▶ timeline_event
   │                 ├──1:N──▶ notification
   │                 ├──1:N──▶ reservation ──N:1──▶ store
   │                 └──1:N──▶ transfer_code
   │
   ├──1:N──▶ password_reset_token
   └──1:N──▶ transfer_code (발급자 / 사용자, 각각 별도 FK)
```

> **주의 (도식화 시)**: `passport.owner_account_id`는 **바뀔 수 있다.** 승계(transfer)가
> 일어나면 같은 여권 행의 소유자가 다른 계정으로 이동한다. 즉 account–passport는 고정
> 소유가 아니라 "현재 소유자" 관계다.

### 1-2. 테이블 상세

#### `account` — 계정
| 컬럼 | 타입 | 제약 | 비고 |
|---|---|---|---|
| id | BIGSERIAL | PK | |
| email | VARCHAR(255) | NOT NULL | ACTIVE 계정 한정 유니크(소문자 기준) |
| password_hash | VARCHAR(255) | NOT NULL | |
| nickname | VARCHAR(100) | | |
| status | VARCHAR(20) | NOT NULL, 기본 `ACTIVE` | `AccountStatus` |
| withdrawn_at | TIMESTAMP | | 탈퇴 시각 |
| care_alerts_enabled | BOOLEAN | NOT NULL, 기본 TRUE | 케어 알림 수신 여부 |
| journey_alerts_enabled | BOOLEAN | NOT NULL, 기본 TRUE | 대응 알림 타입 없음(미사용) |
| marketing_alerts_enabled | BOOLEAN | NOT NULL, 기본 FALSE | 대응 알림 타입 없음(미사용) |
| created_at | TIMESTAMP | NOT NULL | |

- 유니크: `uq_account_email_active` — `LOWER(email)` where `status='ACTIVE'`
  → **탈퇴한 계정의 이메일로 재가입이 가능하다**(부분 유니크 인덱스)

#### `passport` — 제품 여권 (핵심 엔티티)
| 컬럼 | 타입 | 제약 | 비고 |
|---|---|---|---|
| id | BIGSERIAL | PK | |
| serial_number | VARCHAR(20) | NOT NULL | 대문자로 정규화 |
| purchase_year | INT | NOT NULL | `purchase_date`에서 서버가 계산 |
| owner_account_id | BIGINT | NOT NULL, FK→account | **승계 시 변경됨** |
| model_name | VARCHAR(100) | NOT NULL | |
| nickname | VARCHAR(100) | | 사용자가 붙인 애칭 |
| purchase_date | DATE | NOT NULL | |
| purchase_place | VARCHAR(200) | | |
| receipt_image_url | VARCHAR(500) | | **API 응답에서 의도적 제외**(개인정보) |
| has_receipt_tag | BOOLEAN | NOT NULL, 기본 false | 영수증 첨부 여부만 노출 |
| baseline_image_urls | TEXT[] | NOT NULL, 기본 `{}` | 등록 시점 상태 사진 |
| usage_frequency | VARCHAR(30) | NOT NULL | `UsageFrequency` |
| status | VARCHAR(20) | NOT NULL, 기본 `ACTIVE` | `PassportStatus` |
| created_at | TIMESTAMP | NOT NULL | |

- 유니크: `uq_passport_serial_year_active` — `(UPPER(serial_number), purchase_year)` where `status='ACTIVE'`
  → **같은 시리얼+구매연도 조합은 동시에 하나만 활성**. 삭제되면 재등록 가능
- 삭제는 **소프트 삭제**(`status='DELETED'`), 행은 남는다

#### `diagnosis` — 마모 진단
| 컬럼 | 타입 | 제약 | 비고 |
|---|---|---|---|
| id | BIGSERIAL | PK | |
| passport_id | BIGINT | NOT NULL, FK→passport | |
| diagnosis_type | VARCHAR(20) | NOT NULL | `DiagnosisType` (SELF/STORE) |
| image_urls | TEXT[] | NOT NULL | Cloudinary URL |
| item_scores | JSONB | NOT NULL | 항목명→0~100 점수 |
| overall_grade | VARCHAR(20) | NOT NULL | `OverallGrade` |
| evidence_text | VARCHAR(1000) | NOT NULL | 판정 근거 |
| diagnosed_at | TIMESTAMP | NOT NULL | |
| created_at | TIMESTAMP | NOT NULL | |

> `item_scores`의 키 구성은 **진단 엔진에 따라 다르다**(5절 참고).

#### `care_record` — 케어 기록
| 컬럼 | 타입 | 제약 |
|---|---|---|
| id | BIGSERIAL | PK |
| passport_id | BIGINT | NOT NULL, FK→passport |
| care_type | VARCHAR(100) | NOT NULL |
| material_type | VARCHAR(100) | |
| notes | VARCHAR(1000) | |
| image_url | VARCHAR(500) | |
| completed_at | TIMESTAMP | NOT NULL (미래 시각 불가) |
| created_at | TIMESTAMP | NOT NULL |

#### `timeline_event` — 사용자 직접 기록
| 컬럼 | 타입 | 제약 | 비고 |
|---|---|---|---|
| id | BIGSERIAL | PK | |
| passport_id | BIGINT | NOT NULL, FK→passport | |
| event_type | VARCHAR(30) | NOT NULL, 기본 `MOMENT` | `TimelineEventType` |
| note | VARCHAR(1000) | | |
| image_url | VARCHAR(500) | | |
| event_date | TIMESTAMP | NOT NULL | 사용자가 지정 |
| created_at | TIMESTAMP | NOT NULL | |

#### `notification` — 알림
| 컬럼 | 타입 | 제약 | 비고 |
|---|---|---|---|
| id | BIGSERIAL | PK | |
| passport_id | BIGINT | NOT NULL, FK→passport | |
| type | VARCHAR(30) | NOT NULL | `NotificationType` |
| reason_factors | JSONB | NOT NULL | 발생 근거(예: `{"소유일수":100}`) |
| message | VARCHAR(500) | NOT NULL | |
| overall_score | INTEGER | | 진단 기반 알림일 때만 |
| read | BOOLEAN | NOT NULL, 기본 false | |
| dismissed | BOOLEAN | NOT NULL, 기본 false | |
| created_at | TIMESTAMP | NOT NULL | |

#### `store` — 매장 (시드 데이터만, CRUD API 없음)
| 컬럼 | 타입 | 제약 |
|---|---|---|
| id | BIGSERIAL | PK |
| name | VARCHAR(100) | NOT NULL |
| address | VARCHAR(200) | NOT NULL |
| business_hours_start | TIME | NOT NULL |
| business_hours_end | TIME | NOT NULL |
| slot_length_minutes | INT | NOT NULL |

- 시드 3곳: MCM 강남점(10:00~19:00), 명동점(10:30~20:00), 부산센텀점(10:00~18:30), 모두 60분 슬롯
- 요일별 영업시간·휴무일 개념 없음(의도적 단순화)

#### `reservation` — 공식 케어 예약
| 컬럼 | 타입 | 제약 | 비고 |
|---|---|---|---|
| id | BIGSERIAL | PK | |
| passport_id | BIGINT | NOT NULL, FK→passport | |
| store_id | BIGINT | NOT NULL, FK→store | |
| slot_date_time | TIMESTAMP | NOT NULL | |
| request_items | TEXT[] | NOT NULL | `CareRequestItemType`, 최소 1개 |
| status | VARCHAR(20) | NOT NULL | `ReservationStatus` |
| created_at | TIMESTAMP | NOT NULL | |

- 유니크: `uq_reservation_store_slot_requested` — `(store_id, slot_date_time)` where `status='REQUESTED'`
  → **슬롯당 정원 1건**. 취소하면 그 슬롯이 다시 열린다
- 슬롯 테이블이 없다 — "영업시간 그리드 − 이미 예약된 슬롯"으로 **요청 시점에 계산**

#### `transfer_code` — 여권 승계 코드
| 컬럼 | 타입 | 제약 | 비고 |
|---|---|---|---|
| id | BIGSERIAL | PK | |
| passport_id | BIGINT | NOT NULL, FK→passport | |
| code | VARCHAR(6) | NOT NULL, UNIQUE | 대문자+숫자 6자리 |
| issued_by_account_id | BIGINT | NOT NULL, FK→account | 양도하는 사람 |
| status | VARCHAR(20) | NOT NULL | `TransferStatus` |
| redeemed_by_account_id | BIGINT | FK→account | 승계받은 사람 |
| redeemed_at | TIMESTAMP | | |
| expires_at | TIMESTAMP | NOT NULL | 발급 후 **7일** |
| created_at | TIMESTAMP | NOT NULL | |

#### `password_reset_token` — 비밀번호 재설정 토큰
| 컬럼 | 타입 | 제약 |
|---|---|---|
| id | BIGSERIAL | PK |
| account_id | BIGINT | NOT NULL, FK→account |
| token | VARCHAR(255) | NOT NULL, UNIQUE |
| expires_at | TIMESTAMP | NOT NULL |
| used_at | TIMESTAMP | |

#### `shedlock` — 배치 중복 실행 방지 (인프라용, ERD에서 제외해도 무방)
다중 인스턴스 배포에서 리마인더 배치가 겹쳐 도는 것을 막는 표준 테이블.

---

## 2. Enum 값 목록

| Enum | 값 | 쓰이는 곳 |
|---|---|---|
| `AccountStatus` | `ACTIVE`, `WITHDRAWN` | account.status |
| `PassportStatus` | `ACTIVE`, `DELETED` | passport.status |
| `UsageFrequency` | `DAILY`, `FEW_TIMES_A_WEEK`, `OCCASIONAL`, `RARE` | passport.usage_frequency |
| `DiagnosisType` | `SELF`, `STORE` | diagnosis.diagnosis_type |
| `OverallGrade` | `S`, `A`, `B`, `C`, `D` (좋은 순) | diagnosis.overall_grade |
| `NotificationType` | `SELF_CARE`, `STORE_SERVICE`, `REPURCHASE`, `MILESTONE` | notification.type |
| `TimelineEventType` | `MOMENT`, `STORE_VISIT`, `SELF_CARE`, `OTHER` | timeline_event.event_type |
| `ReservationStatus` | `REQUESTED`, `CANCELLED` | reservation.status |
| `CareRequestItemType` | `LEATHER_CLEANING`, `METAL_POLISHING`, `STITCHING_REPAIR`, `OTHER` | reservation.request_items |
| `TransferStatus` | `ISSUED`, `REDEEMED`, `EXPIRED` | transfer_code.status |

> `OverallGrade`는 2026-08-18에 3단계(`GOOD`/`NEEDS_CARE`/`URGENT`)에서 5단계로 교체됐다.
> 기존 진단 기록은 `V15` 마이그레이션이 `GOOD→A`, `NEEDS_CARE→C`, `URGENT→D`로 옮겼다.
>
> `NotificationType.REPURCHASE`(재구매 제안)는 2026-08-18에 구현됐다 — 조건은 4-3절 참고.

---

## 3. 핵심 상태 전이도

### 3-1. 여권 (`passport.status`)

```
   [등록]
     │
     ▼
  ACTIVE ──── 사용자 삭제 / 소유자 탈퇴 ────▶ DELETED
     │                                        (행은 남음, 소프트 삭제)
     │
     └─ 승계(redeem) ─▶ ACTIVE 유지, owner_account_id만 변경
```

### 3-2. 승계 코드 (`transfer_code.status`)

```
  [발급]
    │
    ▼
  ISSUED ──── 다른 계정이 사용 ────▶ REDEEMED  (여권 소유권 이전)
    │
    └──────── 7일 경과 ───────────▶ EXPIRED
```
- 자기 자신에게는 승계 불가(`CANNOT_TRANSFER_TO_SELF`)
- 승계 성공 시 **이전 소유자의 REQUESTED 예약은 자동 취소**된다

### 3-3. 예약 (`reservation.status`)

```
  [예약 생성] ──▶ REQUESTED ──── 사용자 취소 ────▶ CANCELLED
                     │
                     └── 여권 삭제 / 소유자 탈퇴 / 승계 ──▶ CANCELLED (자동)
```
- 매장 직원의 승인/거절 단계 없음(직원 로그인 범위 밖)
- `COMPLETED` 상태는 DB에 없다 — 슬롯 시각이 지났는지는 응답에서 계산

---

## 4. 시스템 흐름도

### 4-1. 제품 등록

```
앱                    백엔드                   Cloudinary
 │  POST /api/passports   │                        │
 │─(사진 + 정보)─────────▶│                        │
 │                        │──영수증·기준사진 업로드─▶│
 │                        │◀────────URL────────────│
 │                        │
 │                        │ 시리얼 형식 검증(대문자 정규화)
 │                        │ 중복 확인(시리얼+구매연도, ACTIVE만)
 │                        │ passport INSERT
 │◀───201 + PassportResponse──
```
- 실패 시 업로드된 이미지는 **고아가 되지 않도록 삭제**된다

### 4-2. 마모 진단 (핵심 흐름)

```
앱              백엔드            Cloudinary        하자탐지 AI
 │ POST .../diagnoses │                 │                │
 │─(사진 여러 장)────▶│                 │                │
 │                    │──사진 업로드────▶│                │
 │                    │◀─────URL────────│                │
 │                    │                 │                │
 │                    │──URL로 사진 다시 내려받기────────▶│  ※ 백엔드가 중계
 │                    │────────────POST /predict────────▶│
 │                    │◀───하자 목록(종류·심각도·신뢰도)──│
 │                    │
 │                    │ 점수 환산 → 항목별 0~100
 │                    │ 최고점 기준 등급 판정 (70↑ D / 40↑ C / 30↑ B / 15↑ A / 그 미만 S)
 │                    │ diagnosis INSERT
 │                    │ ▼ 알림 평가 (4-3)
 │◀──201 + 진단 결과 + 직전 진단 점수──
```
- **진단 엔진은 교체 가능**(5절). 위 그림은 `ml` 엔진 기준
- 알림 평가가 실패해도 진단 저장은 롤백되지 않는다(로그만 남김)

### 4-3. 알림 발생 경로 (두 가지)

```
① 진단 직후 (동기)
   진단 저장 ──▶ 계정의 care_alerts_enabled 확인
                    │
                    ├─ 등급 C ──────▶ SELF_CARE 알림
                    ├─ 등급 D ──────▶ STORE_SERVICE 알림
                    │                     └─ 추가로 아래 두 조건을 모두 만족하면
                    │                        ──▶ REPURCHASE 알림 (재구매 제안)
                    │                            · 소유 1095일(3년) 이상
                    │                            · 최근 진단이 연속 2회 D등급
                    │                            (단, 30일 내 같은 제안이 있으면 생략)
                    └─ 등급 S/A/B ──▶ 알림 없음

② 매일 09:00 배치 (ReminderScheduler, ShedLock으로 중복 실행 방지)
   활성 여권 전체 순회
        │
        ├─ 마지막 활동(최근 진단일, 없으면 구매일)로부터 90일 초과
        │     └─ 30일 내 SELF_CARE 알림 없으면 ──▶ SELF_CARE 알림
        │
        └─ 소유일수가 100 / 365 / 1000일 도달 & 미발송
              └──▶ MILESTONE 알림
```
- 임계값은 전부 `application.yml`의 설정값이라 코드 수정 없이 조정 가능하다:
  `notification.reminder-threshold-days=90`, `reminder-cooldown-days=30`,
  `repurchase-ownership-days=1095`, `repurchase-consecutive-urgent=2`

**재구매 제안의 설계 의도 (FR-NOT-06 "Care-First")**

기능요구서는 재구매 제안을 "(a) 수선 불가 손상 / (b) 소유기간 장기 / (c) 고객이 관심 표명"
중 하나일 때만 노출하라고 규정한다. 그런데 이를 문자 그대로 OR로 읽으면 **단순히 오래 쓴
제품마다 재구매를 권하게 되어** Care-First 원칙 자체와 어긋난다. 그래서 더 보수적인
FR-NOT-03의 AND 조건(장기 소유 **그리고** 반복 긴급)을 실제 트리거로 삼았다.

- (a) 수선 불가 손상 → "연속 2회 D등급"으로 근사한다(한 번의 D는 수선으로 회복 가능하다고 본다)
- (b) 소유기간 장기 → 구매일로부터 3년
- (c) 고객 관심 표명 → **대응하는 UI/API가 없어 이번 범위 밖**

즉 재구매 제안은 "케어로 회복이 안 되는 상태가 반복되는, 오래 함께한 제품"에만 뜬다.

> **데모 시연 방법**: 기본값이 3년이라 방금 만든 데이터로는 절대 뜨지 않는다.
> `.env`에 `NOTIFICATION_REPURCHASE_OWNERSHIP_DAYS=1`을 넣고 `docker compose up -d backend`로
> 백엔드만 재시작한 뒤, 같은 제품에 D등급이 나오는 진단을 연속 두 번 제출하면 재구매 알림이
> 생성된다.

### 4-4. 통합 타임라인 조회

`GET /api/passports/{id}/timeline` 한 번으로 **6개 소스를 합쳐 시간순 정렬**해 돌려준다.

```
  REGISTRATION  (여권 등록 = passport.created_at)
  DIAGNOSIS     (진단)
  CARE          (케어 기록)
  NOTIFICATION  (읽은 알림만)
  USER_EVENT    (사용자 직접 기록)
  RESERVATION   (예약, 취소된 것도 상태값 그대로 노출)
  TRANSFER      (승계 완료 건)
        │
        └──▶ occurredAt 오름차순 정렬 → List<TimelineItem>
```
- **페이지네이션 없음** (알려진 제약, 의도적 보류)
- 앱의 여권 스탬프 화면이 이 목록을 그대로 스탬프로 그린다(페이지당 7개, 최대 50개)

### 4-5. 예약 (슬롯 계산 방식)

```
GET /api/stores/{id}/available-slots?date=...
        │
        ├─ 매장 영업시간 + 슬롯 길이로 시간 그리드 생성
        ├─ REQUESTED 상태 예약이 잡은 슬롯 제외
        └─ 이미 지난 시각 제외
                    │
                    ▼
              가용 슬롯 목록

POST .../reservations ──▶ (store_id, slot_date_time) 부분 유니크 인덱스가
                          동시 예약을 DB 레벨에서 차단 → SLOT_ALREADY_BOOKED
```

### 4-6. 여권 승계

```
[기존 소유자]                     [새 소유자]
 POST .../transfer-code
      │
      ▼
  6자리 코드 발급 (7일 유효) ─── 코드 전달 ───▶
                                     │
                          GET .../transfer/{code}/preview
                                     │ (모델명·등급·소유일수 미리보기)
                                     ▼
                          POST .../transfer/redeem
                                     │
                                     ├─ 코드 유효성·자기양도 여부 확인
                                     ├─ passport.owner_account_id 변경
                                     ├─ transfer_code → REDEEMED
                                     └─ 이전 소유자의 REQUESTED 예약 자동 취소
```

### 4-7. 회원 탈퇴 시 연쇄

```
DELETE /api/account/me
        │
        ├─ account.status → WITHDRAWN, withdrawn_at 기록
        ├─ 소유한 여권 전부 → status DELETED (소프트 삭제)
        └─ 그 여권들의 REQUESTED 예약 → CANCELLED
```
- 이메일 유니크가 ACTIVE 한정이라 **같은 이메일로 재가입 가능**

---

## 5. 진단 엔진 (교체 가능 구조)

`WEAR_DIAGNOSIS_ENGINE` 환경변수로 구현체를 갈아끼운다. 도식화 시 "마모 진단" 박스가
아래 셋 중 하나로 바뀔 수 있다는 점을 표시하면 정확하다.

| 엔진 | 동작 | 항목 구성 | 외부 의존 |
|---|---|---|---|
| `rule-based` | 사진을 보지 않고 이전 점수에서 기계적으로 증가 (자리표시자) | 4개: 마모·코팅벗겨짐·변색·부자재상태 | 없음 |
| `ml` | YOLO11l-seg 하자 탐지 결과를 점수로 환산 | 7개: 찢어짐·스크래치·오염·마모·밑창분리·지퍼파손·변형 | 하자 탐지 서버 |
| `vlm` (계획) | 탐지 결과 + 원본 이미지를 VLM이 보고 등급·근거 생성 | 7개(동일) | 하자 탐지 서버 + Ollama |

- 공통 점수 체계: 항목별 0~100, 전체 등급은 **최고 점수** 기준
  (70↑ `D` / 40↑ `C` / 30↑ `B` / 15↑ `A` / 그 미만 `S`)
- `ml` 엔진은 신뢰도 0.35 미만 탐지를 무시한다(오탐 방지)

---

## 6. 도식화 시 주의할 점

1. **소유권은 이동한다** — account–passport를 고정 1:N으로 그리면 승계 기능이 표현되지 않는다.
2. **삭제는 전부 소프트 삭제** — 여권·계정 모두 행이 남는다. "삭제" 화살표가 데이터 소멸로
   보이지 않게 그릴 것.
3. **AR 인식은 이 ERD에 없다** — 앱이 AR 서버를 직접 호출하고 결과를 DB에 저장하지 않는다.
   시스템 흐름도에는 넣되 ERD에는 대응 테이블이 없다.
4. **이미지는 DB에 없다** — 전부 Cloudinary URL 문자열로만 저장된다.
5. **`receipt_image_url`은 API로 안 나간다** — 개인정보 보호 목적의 의도적 제외.
6. **부분 유니크 인덱스가 3개** — 이메일·시리얼·예약 슬롯. "ACTIVE일 때만 유니크"라는
   조건이 재등록/재가입/재예약 가능이라는 기능으로 직결되므로 도식에 각주로 남기면 좋다.
