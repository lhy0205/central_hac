# 공식 케어 예약(Reservation) — 설계

**날짜**: 2026-08-14
**범위**: FR-CAR-04(매장 선택·시간슬롯 예약 시스템)를 "미확정"에서 "구현 확정"으로 전환. 매장(Store) 도메인 신설 + 예약(Reservation) 도메인 신설.
**참고**: `MCM_Nomad_Passport_기능요구서.md` 3.6(Timeline), 3.8(Store, 기존 계획은 조회 전용이었음), 4절(미확정 사항 3번)

## 1. 배경

기존 계획(3.8절)의 Store는 "시드 데이터 + `TimelineEvent.storeId` 표시용 단건 조회"뿐이었다. FR-CAR-04("공식 케어 예약의 실제 구현 수준" — 버튼 CTA vs 매장·시간슬롯 실제 예약 시스템)가 미확정으로 남아 있었는데, 이번에 팀이 **실제 예약 시스템으로 구현**하기로 확정했다. FR-CAR-03(진단 결과 화면의 "공식 예약" CTA)은 이미 필수로 확정돼 있었고, 이 예약 시스템이 그 CTA가 실제로 여는 화면이 된다.

매장 직원 로그인·권한 체계는 범위 밖(기획서 5절, 확정)이므로, "직원이 승인/거절한다" 같은 워크플로우는 없다. 예약은 고객이 스스로 생성/취소하는 자기완결적 리소스다.

## 2. 핵심 설계 결정

| 항목 | 결정 | 근거 |
|---|---|---|
| 시간슬롯 관리 | 슬롯 테이블 없이 계산 | `Store`에 영업시간·슬롯길이만 저장, 요청 시점에 "영업시간 그리드 − 이미 REQUESTED인 예약"으로 가용 슬롯을 계산. 스키마 단순, 해커톤 스코프에 적합 |
| 슬롯당 정원 | 1건 | 동시성 제어가 유니크 제약 하나로 끝남 (`(storeId, slotDateTime)` partial unique index, `status='REQUESTED'`만 대상) |
| 요청 항목 | 고정 enum 다중선택, 최소 1개 | `CareRequestItemType` — 구조화된 데이터로 통계/체크박스 UI에 바로 씀 |
| 예약 상태 | `REQUESTED` / `CANCELLED`만 | 직원 승인 단계 없음(직원 로그인 범위 밖). `COMPLETED`는 DB에 저장하지 않고, 슬롯 시각이 지났는지는 응답에서 계산 |
| CareRecord 연동 | 없음, 완전 별개 | 방문 후 실제 기록은 고객이 기존 FR-CAR-01 API로 직접 남김. 자동 연결에는 직원 확인 단계가 필요한데 그게 없음 |
| 타임라인 통합 | `RESERVATION` 타입 신규 추가 | `TimelineEvent.STORE_VISIT`(사용자가 직접 남기는 매장방문 기록)은 그대로 유지 — 공식 예약과는 별개 트랙. 5번째 소스로 `TimelineService`에 합류 |
| 취소 재요청 | 멱등(204 무동작) | `PATCH /api/notifications/{id}/read` 등 기존 상태변경 API와 동일 패턴 |
| 예약 응답에 매장명 포함 | 포함 (`storeName` 필드) | 목록 화면에서 매장 조회 API를 따로 부르는 왕복을 없앰 |
| 여권 삭제/탈퇴 시 예약 처리 | `REQUESTED` 예약을 자동 `CANCELLED`로 전환 | 그냥 두면 삭제된 여권의 예약이 DB엔 `REQUESTED`로 남아 `(storeId, slotDateTime)` 유니크 제약이 그 슬롯을 영구히 막아버림(아무도 재예약 불가, 본인도 API로 취소 불가 — 여권이 이미 안 보이므로). `PassportService.delete()`와 `AccountService.withdraw()` 둘 다 각자 소유 여권을 soft-delete하는 지점에서 호출 |

## 3. 데이터 모델

```
Store                                  # 신규, 시드 데이터만(CRUD API 없음)
├── id (PK)
├── name
├── address
├── businessHoursStart (LocalTime)
├── businessHoursEnd (LocalTime)
└── slotLengthMinutes (int)            # 요일별 영업시간·휴무일 개념 없음(전 요일 동일, 의도적 단순화)

Reservation                            # 신규
├── id (PK)
├── passportId                         # FK 없음, 다른 도메인과 동일 컨벤션(raw id)
├── storeId
├── slotDateTime (LocalDateTime)
├── requestItems (List<CareRequestItemType>, Postgres 배열)
├── status (REQUESTED / CANCELLED)
└── createdAt                          # JPA auditing

CareRequestItemType (enum)
LEATHER_CLEANING, METAL_POLISHING, STITCHING_REPAIR, OTHER
```

**제약**: `(storeId, slotDateTime)`에 `status='REQUESTED'`인 행만 대상으로 하는 partial unique index (`uq_reservation_store_slot_requested`, 기존 `uq_passport_serial_year_active` 패턴과 동일).

## 4. API

```
GET    /api/stores                                    매장 목록
GET    /api/stores/{id}                                매장 상세
GET    /api/stores/{storeId}/available-slots?date=     해당 날짜 가용 슬롯 목록
POST   /api/passports/{passportId}/reservations         예약 생성
GET    /api/passports/{passportId}/reservations         내 예약 목록(페이지네이션, 전체 상태 포함)
GET    /api/reservations/{id}                           예약 상세
PATCH  /api/reservations/{id}/cancel                     예약 취소(멱등)
```

전부 기존과 동일하게 JWT 인증 필요. `POST .../reservations`·`GET .../reservations`(목록)는 다른 여권 하위 리소스 생성/목록 엔드포인트와 동일하게 경로의 `passportId`로 `PassportOwnershipGuard`를 거친다. `GET /api/reservations/{id}`·`PATCH .../cancel`은 기존 `DiagnosisService.getDetail()` 패턴과 동일하게: id로 먼저 조회(없으면 404) → `PassportOwnershipGuard.getOwnedActivePassport(reservation.passportId, ...)`로 소유권/활성상태 확인(탈퇴 계정·삭제 여권 자동 차단).

> 유니크 제약은 여권이 아니라 `(storeId, slotDateTime)` 기준이라, 같은 계정이 소유한 서로 다른 여권 2개로 같은 매장·같은 시각을 동시에 예약하려 하면 두 번째 요청은 `SLOT_ALREADY_BOOKED`로 막힌다 — 의도된 동작(슬롯 하나는 실제로 한 번에 한 건만 응대 가능하다는 물리적 제약을 반영).

**요청/응답 예시**
```json
// POST /api/passports/{id}/reservations
{ "storeId": 1, "slotDateTime": "2026-08-20T14:00:00", "requestItems": ["LEATHER_CLEANING", "METAL_POLISHING"] }

// ReservationResponse
{
  "id": 1, "passportId": 1, "storeId": 1, "storeName": "강남점",
  "slotDateTime": "2026-08-20T14:00:00",
  "requestItems": ["LEATHER_CLEANING", "METAL_POLISHING"],
  "status": "REQUESTED", "createdAt": "2026-08-14T10:00:00"
}

// GET /api/stores/{storeId}/available-slots?date=2026-08-20
["2026-08-20T10:00:00", "2026-08-20T11:00:00", "2026-08-20T13:00:00"]
```

**가용 슬롯 계산 규칙** (`GET .../available-slots`)
1. `businessHoursStart`부터 `slotLengthMinutes` 간격으로 슬롯 시작시각을 나열하되, `시작시각 + slotLengthMinutes ≤ businessHoursEnd`인 것만 유효(영업시간이 슬롯 길이로 안 나눠떨어지면 마지막 자투리 시간은 버림 — 예: 10~18:30에 60분 슬롯이면 마지막 슬롯은 17:00시작분까지만).
2. 그중 해당 매장·해당 슬롯에 `status='REQUESTED'`인 예약이 이미 있는 건 제외.
3. **주입된 `Clock` 기준 현재 시각 이전인 슬롯도 제외** — 조회 날짜가 오늘이면 이미 지난 시각까지 "가능"으로 잘못 내려주면 안 됨(그대로 예약 시도 시 `INVALID_SLOT_TIME`로 튕기는 UX 버그가 됨). 미래 날짜 조회는 이 필터의 영향을 받지 않음.

## 5. 검증 규칙 & 에러코드

- `slotDateTime`: 주입된 `Clock` 기준 미래 시각(`@Future`, 이 프로젝트는 `LocalValidatorFactoryBean`에 커스텀 `ClockProvider`를 이미 연결해둬서 고정 Clock과 일치함), 서비스 레벨에서 매장 영업시간·슬롯 그리드에 정확히 맞는 값인지 검증(안 맞으면 `INVALID_SLOT_TIME`, 400)
- `requestItems`: `@Size(min = 1)`
- 이미 예약된 슬롯: unique 제약 위반(`DataIntegrityViolationException`) → `SLOT_ALREADY_BOOKED`(409)로 변환(`TransferService.issueCode()`와 동일 패턴)
- 존재하지 않는 매장: `STORE_NOT_FOUND`(404)
- 존재하지 않는 예약: `RESERVATION_NOT_FOUND`(404)

신규 `ErrorCode`: `STORE_NOT_FOUND`(404), `RESERVATION_NOT_FOUND`(404), `SLOT_ALREADY_BOOKED`(409), `INVALID_SLOT_TIME`(400).

**알려진 미해결 경합(의도적으로 안 고침)**: A가 예약을 취소하는 트랜잭션과 B가 같은 슬롯을 새로 예약하는 트랜잭션이 정확히 겹치면, B의 INSERT가 A의 CANCELLED 커밋보다 먼저 유니크 제약을 평가해 `SLOT_ALREADY_BOOKED`를 스퓨리어스하게 받을 수 있다(재시도하면 성공). 실제 손해(이중예약)는 없고 극히 좁은 창이라, `TransferCode.generateCode()` 충돌 재시도 미구현과 같은 이유로 이번 스코프에서는 그대로 둔다.

## 6. 타임라인 통합

`TimelineService.getTimeline()`의 5번째 소스로 Reservation 추가:
```
type="RESERVATION", id=reservationId, occurredAt=slotDateTime,
detail={ storeName, requestItems, status }
```
`CANCELLED`로 바뀐 예약도 타임라인에서 사라지지 않고 `status`값으로 그대로 노출(다른 도메인이 이력을 숨기지 않는 것과 동일 원칙). 기존에 알려진 페이지네이션 없음 한계(전량 조회 후 메모리 정렬)는 그대로 이어받음 — 이번 설계에서 새로 만드는 문제 아님.

## 7. 여권 삭제/탈퇴 시 예약 취소

`PassportService.delete()`와 `AccountService.withdraw()`는 서로 다른 코드 경로로 각자 여권을 soft-delete한다(`withdraw()`는 승계 경합 방지를 위해 잠금 후 재확인하는 별도 로직을 이미 갖고 있어 `delete()`를 재사용하지 않음). 두 지점 모두에서 soft-delete 직후 `ReservationRepository`의 벌크 업데이트(`UPDATE reservation SET status='CANCELLED' WHERE passport_id=:id AND status='REQUESTED'`)를 호출해 슬롯을 반드시 반납한다. 이걸 새 `ReservationService`를 주입해서 하지 않고 리포지토리를 직접 호출하는 이유는, `NotificationService`가 이미 `PassportRepository`/`DiagnosisRepository`를 서비스가 아니라 리포지토리 레벨로 직접 참조하는 것과 동일한 이 코드베이스의 기존 컨벤션을 따르기 위함이다.

## 8. 여권 승계와의 상호작용

승계(Transfer)가 일어나도 Reservation은 별도 처리가 필요 없다 — 소유권 확인이 항상 `Passport.ownerAccountId`를 실시간 조회하므로, 승계 완료 후에는 새 소유자가 자동으로 기존 예약도 조회·취소할 수 있게 된다(의도된 동작 — 승계 시 기존 이력을 유지한다는 기존 정책과 일치).

## 9. 마이그레이션

`V11__create_store_table.sql`(테이블 생성 + 매장 2~3곳 시드 데이터), `V12__create_reservation_table.sql`(테이블 + `uq_reservation_store_slot_requested` partial unique index).

## 10. 의도적으로 뺀 것 (YAGNI)

- 매장별 요일별 영업시간·휴무일 — 전 요일 동일 영업시간으로 단순화
- 예약 취소 시 리마인드/알림 발송 — `NotificationService` 연동 없음
- 예약 완료(`COMPLETED`) 상태 저장 — 직원 확인 주체가 없어 저장할 근거 데이터가 없음
- 자유 텍스트 요청사항 — 체크리스트로 대체(요청 시 별도 확정)
