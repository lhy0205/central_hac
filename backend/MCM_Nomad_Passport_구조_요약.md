# MCM Nomad Passport — 백엔드 구조 요약

> 멋쟁이사자처럼 14기 중앙 해커톤 · SJF 트랙 Challenge 03
> 가방 한 개당 여권 한 권 — 구매부터 마모 진단, 케어, 재구매 제안까지의 생애주기를 추적하는 백엔드 우선 MVP.
> 참고 원본: `MCM_Nomad_Passport_개발_브리핑.md`, `MCM_Nomad_Passport_기획서_v6.docx`, `docs/design/backend-architecture.md`

## 1. 핵심 기술 결정

| 항목 | 결정 | 근거 |
|---|---|---|
| DB | PostgreSQL | JSONB로 진단 점수·알림 근거 같은 반정형 데이터 저장, Railway 1급 지원 |
| 파일 저장 | Cloudinary (외부 오브젝트 스토리지) | Railway 로컬 디스크는 휘발성. URL만 DB에 저장해 관리 부담 최소화 |
| 인증 | JWT (이메일/비밀번호만) | 소셜 로그인·MCM 멤버십 연동은 외부 시스템 필요 → 로드맵으로 연기 |
| 시리얼 입력 | 수동 입력만 | 카메라/OCR 연동은 프론트엔드 합류 후 별도 진행 |
| 아키텍처 | 단일 Spring Boot 모놀리스, 패키지-바이-피처 | 백엔드 1인 체제에서 마이크로서비스는 과설계. AI 삽입은 인터페이스 분리로 충분 |

## 2. 프론트엔드 방향 (2026-08-07 결정)

프론트엔드는 **모바일 앱**으로 만들기로 함 (웹 아님).

- 지금 짜놓은 백엔드는 REST API + JWT 헤더 인증이라 **구조 변경 불필요**. REST API는 웹 전용 규격이 아니라 HTTP 기반 통신 방식일 뿐이라, 웹이든 네이티브/하이브리드 모바일 앱이든 동일한 엔드포인트를 그대로 호출한다. JWT를 헤더로 주고받는 방식이라 쿠키/CORS 이슈도 애초에 없음.
- **유일한 실질적 격차: 푸시 알림.** 현재 `Notification` 도메인은 DB에 레코드만 쌓고 앱이 `GET /api/passports/{id}/notifications`로 조회하는 인앱(in-app) 방식. 모바일 앱은 백그라운드 푸시가 기대되므로, 기존 Notification 생성 트리거(진단 등록 직후 평가 + 매일 스케줄러) 위에 FCM/APNs 발송을 추가해야 함. 도메인 모델·트리거 로직 자체는 변경 없음.
- 시리얼 OCR(현재 수동 입력만, 로드맵 항목)은 모바일 카메라 확보 시점에 우선순위가 당겨질 수 있음.

## 3. 패키지 구조

```
com.mcm.passport
├── account/       회원가입 · 로그인 · JWT 인증 · 비밀번호 재설정 · 탈퇴
├── passport/      여권 생성 & 제품 등록
├── diagnosis/     마모 진단
│   ├── WearDiagnosisEngine            ← 인터페이스, AI 팀원(이현욱) 결과물 삽입 지점
│   └── RuleBasedWearDiagnosisEngine   ← 현재 구현체 (규칙기반)
├── notification/  타이밍 알림 + 재진단 리마인드 스케줄러
├── care/          케어 기록 저장
├── timeline/      여권 타임라인 조회 (다른 도메인 이력을 통합 조회, 자체 테이블 없음)
└── common/        Cloudinary 업로드 · 전역 예외처리 · JWT 필터
```

## 4. 데이터 모델

```
Account
├── id (PK)
├── email (unique)
├── passwordHash
├── nickname
├── status (ACTIVE / WITHDRAWN)
├── withdrawnAt (nullable)
└── createdAt

PasswordResetToken            # Account 1—N
├── id (PK)
├── accountId (FK → Account)
├── token
├── expiresAt
└── usedAt (nullable)

Passport                      # 제품 개체 1개 = 실물 가방 1개, Account 1—N
├── id (PK)
├── serialNumber              # 신형 ^[A-Za-z]\d{4}$ / 빈티지 ^\d{4}$
├── purchaseYear
│   └── UNIQUE (serialNumber, purchaseYear) WHERE status = 'ACTIVE'  ← 부분 유니크 인덱스
├── ownerAccountId (FK → Account)
├── modelName, nickname
├── purchaseDate, purchasePlace
├── receiptImageUrl (nullable, Cloudinary URL — 비공개 데이터, 공개 API 노출 금지)
├── hasReceiptTag (boolean)
├── baselineImageUrls (text[], Cloudinary URL)
├── usageFrequency (DAILY / FEW_TIMES_A_WEEK / OCCASIONAL / RARE)
├── status (ACTIVE / DELETED) — 소프트 삭제
└── createdAt

Diagnosis                     # 마모 진단 1회 기록, Passport 1—N
├── id (PK)
├── passportId (FK → Passport)
├── diagnosisType (SELF / STORE)
├── imageUrls (text[], 비공개 데이터)
├── itemScores (JSONB)        # {마모, 코팅벗겨짐, 변색, 부자재상태} 0~100
├── overallGrade (GOOD / NEEDS_CARE / URGENT)
├── evidenceText, diagnosedAt
└── createdAt

Notification                  # Passport 1—N
├── id (PK)
├── passportId (FK → Passport)
├── type (SELF_CARE / STORE_SERVICE / REPURCHASE)
├── reasonFactors (JSONB)     # {마모도, 사용빈도, 계절, 구매경과일}
├── message
├── isRead, isDismissed (boolean)
└── createdAt

CareRecord                    # Passport 1—N
├── id (PK)
├── passportId (FK → Passport)
├── careType, materialType
├── notes, imageUrl, completedAt
└── createdAt

TimelineEvent                 # 사용자 직접 추가 이벤트, Passport 1—N
├── id (PK)
├── passportId (FK → Passport)
├── note, imageUrl, eventDate
└── createdAt
```

**타임라인 조회**는 별도 테이블 없이 `Passport` 생성시점 + `Diagnosis` + `CareRecord` + `Notification`(읽음 처리분) + `TimelineEvent`를 매 요청마다 합쳐 시간순 정렬하는 조회 전용 로직으로 처리.

**정품 검증 범위**: 실제 MCM 시리얼 DB 접근이 없으므로 (1) 시리얼 포맷 정규식 검증 + (2) 복합 유니크 제약을 통한 중복 등록 거부로 한정.

**비공개 데이터 원칙**: `Passport.receiptImageUrl`, `Diagnosis.imageUrls`는 절대 공개용 API/DTO에 포함하지 않음 (본인용 DTO와 공개용 DTO를 처음부터 분리 설계).

## 5. API 엔드포인트 (도메인 6개, 총 22개)

**account**
```
POST   /api/auth/signup
POST   /api/auth/login
POST   /api/auth/password-reset
POST   /api/auth/password-reset/confirm
GET    /api/account/me
PATCH  /api/account/me
DELETE /api/account/me                # 소프트 삭제, 소유 Passport 전체 status=DELETED 연쇄 처리
```

**passport**
```
POST   /api/passports                 # 시리얼 수동입력, 모델, 구매정보(purchaseYear 자동추출), 영수증, 베이스라인 사진, 사용빈도
GET    /api/passports                 # 내 컬렉션, 상태등급/소유기간/최근진단일 파생 필드 포함, 페이지네이션
GET    /api/passports/{id}
PATCH  /api/passports/{id}
DELETE /api/passports/{id}            # 소프트 삭제 → 동일 (serialNumber, purchaseYear) 재등록 허용됨
```

**diagnosis**
```
POST   /api/passports/{id}/diagnoses        # 등록 직후 Notification 즉시 평가 트리거
GET    /api/passports/{id}/diagnoses        # 페이지네이션, 직전 진단 비교용 데이터 포함
GET    /api/diagnoses/{diagnosisId}
```

**notification** (생성 API 없음 — 진단 직후 트리거 + 스케줄러로만 생성)
```
GET    /api/passports/{id}/notifications    # 페이지네이션
PATCH  /api/notifications/{id}/read
PATCH  /api/notifications/{id}/dismiss
```

**care**
```
POST   /api/passports/{id}/care-records
GET    /api/passports/{id}/care-records     # 페이지네이션
GET    /api/care-records/{id}
```

**timeline**
```
GET    /api/passports/{id}/timeline         # 페이지네이션
POST   /api/passports/{id}/timeline/events
GET    /api/timeline/events/{id}
```

## 6. 마모 진단 엔진 교체 지점

```java
public interface WearDiagnosisEngine {
    DiagnosisResult diagnose(List<String> imageUrls, Diagnosis previousDiagnosis);
}

public class DiagnosisResult {
    Map<String, Integer> itemScores;   // {마모, 코팅벗겨짐, 변색, 부자재상태} 0~100
    String overallGrade;               // GOOD / NEEDS_CARE / URGENT
    String evidenceText;
}
```

- **현재 구현**: `RuleBasedWearDiagnosisEngine` — 베이스라인/직전 사진과의 색상 대비·밝기 분석 기반 결정론적 규칙. 데모 안정성을 위해 항상 예측 가능한 결과.
- **교체 지점**: `application.yml`의 `wear-diagnosis.engine: rule-based | ai` 설정값으로 `@ConditionalOnProperty` 스위칭. AI 팀원(이현욱)은 같은 인터페이스만 구현하면 됨.
- **AI 팀원과 사전 합의 필요**: `itemScores`의 키 이름(마모/코팅벗겨짐/변색/부자재상태)과 점수 스케일(0~100)을 미리 고정해서 구현체 교체 시 API 응답 포맷이 안 바뀌게 한다.

## 7. 알림 생성 트리거 (Lifecycle Curator)

**입력**: 최신 Diagnosis.overallGrade/itemScores, Passport.usageFrequency, 현재 계절(시스템 날짜 기반), Passport.purchaseDate로부터의 경과일.

**Notification 생성 트리거 2가지**:
1. 진단 등록 직후 즉시 평가 — 결과가 NEEDS_CARE/URGENT면 바로 알림 생성
2. 스케줄러(매일 1회 cron) — `(현재일 - 최근진단일 또는 등록일 중 늦은 쪽) > 90일` && 최근 N일 내 미확인 리마인드 없음 → SELF_CARE 리마인드 생성 (스팸 방지)

**알림 유형 분기 (규칙기반)**:
- NEEDS_CARE → SELF_CARE (셀프케어 가이드 안내)
- URGENT → STORE_SERVICE (공식 서비스 예약 연결 — 실제 예약 시스템 아님, CTA 링크/안내 텍스트 수준)
- 소유기간 장기 + 반복 URGENT 등 조건 → REPURCHASE 제안
- 구체 임계값은 구현 단계에서 AI/데이터 담당과 조율 가능하도록 설정값으로 분리

셀프 케어 가이드 콘텐츠는 DB 테이블이 아니라 애플리케이션 내 정적 데이터로 관리.

## 8. 에러 처리

공통 포맷: `{ "code": "...", "message": "..." }`, `@RestControllerAdvice`로 전역 처리.

| 상황 | 상태코드 / 코드 |
|---|---|
| 시리얼 포맷 불일치 | 400 `INVALID_SERIAL_FORMAT` |
| (serialNumber, purchaseYear) 중복(활성) | 409 `SERIAL_ALREADY_REGISTERED` |
| passport 없음 | 404 `PASSPORT_NOT_FOUND` |
| 소유자 아님 | 403 `FORBIDDEN` |
| Cloudinary 업로드 실패 | 502 `IMAGE_UPLOAD_FAILED` (등록/진단 전체 롤백) |
| JWT 만료/위조 | 401 `UNAUTHORIZED` |
| 이메일 중복가입 | 409 `EMAIL_ALREADY_EXISTS` |
| 재설정 토큰 만료/사용됨 | 400 `RESET_TOKEN_INVALID` |
| 요청 검증 실패 | 400 `VALIDATION_ERROR` (+ 필드별 상세) |

## 9. 진행 상황 (전체 30개 태스크)

**기반 (Task 1–3)**
- [x] Task 1 — Gradle + Spring Boot 스캐폴딩 (완료, 리뷰 승인)
- [ ] Task 2 — Testcontainers 기반 통합 테스트 인프라 + Flyway 연결 ⏸ **현재 블로커: Docker Desktop 데몬 미실행**
- [ ] Task 3 — 전역 에러 처리 프레임워크

**4-1 계정 (Task 4–9)**
- [ ] Task 4 — Account 엔티티 + 리포지토리
- [ ] Task 5 — 회원가입 (POST /api/auth/signup)
- [ ] Task 6 — JWT 인프라 + 로그인 (POST /api/auth/login)
- [ ] Task 7 — 내 프로필 조회/수정
- [ ] Task 8 — 비밀번호 재설정
- [ ] Task 9 — 회원 탈퇴

**4-2 여권 등록 (Task 10–16)**
- [ ] Task 10 — Passport 스키마 + 엔티티 + 리포지토리
- [ ] Task 11 — 시리얼 번호 검증기
- [ ] Task 12 — 이미지 저장소 추상화 (Cloudinary)
- [ ] Task 13 — 여권 등록
- [ ] Task 14 — 여권 목록/상세 조회
- [ ] Task 15 — 여권 수정/삭제
- [ ] Task 16 — 회원 탈퇴 → 여권 소프트삭제 연쇄 처리 연결

**4-3 마모 진단 (Task 17–21)**
- [ ] Task 17 — Diagnosis 스키마 + 엔티티 + 리포지토리
- [ ] Task 18 — 마모 진단 엔진 (규칙기반 + AI 교체 지점)
- [ ] Task 19 — 진단 등록
- [ ] Task 20 — 진단 목록/상세 조회
- [ ] Task 21 — 여권 목록/상세에 최신 진단 정보 반영

**4-4 타이밍 알림 · 케어 (Task 22–27)**
- [ ] Task 22 — Notification 스키마 + 엔티티 + 리포지토리
- [ ] Task 23 — Lifecycle Curator 알림 분기 로직
- [ ] Task 24 — 진단 등록에 알림 평가 연결
- [ ] Task 25 — 알림 목록/읽음/무시
- [ ] Task 26 — 재진단 리마인드 스케줄러
- [ ] Task 27 — 케어 기록 저장

**4-5 타임라인 (Task 28–30)**
- [ ] Task 28 — 사용자 직접 타임라인 이벤트
- [ ] Task 29 — 통합 타임라인 조회
- [ ] Task 30 — 엔드투엔드 회귀 테스트 (등록 → 진단 → 알림 → 타임라인)

## 10. 이번 단계 범위 밖 (로드맵, 발표 슬라이드로만 설명)

인증서 발급, 리세일&승계(소유권 이전, 이력 공유 링크, 소유 해제/인수), 발견&추천, 매장 경험(AR, 매장 체크인), 리캡&게이미피케이션, 설정&지원(다국어 등), 소셜 로그인, MCM 멤버십 연동, 실제 OCR/AI 연동.
