# MCM Nomad Passport — 백엔드 우선 구현 설계

**날짜**: 2026-08-05
**범위**: 프론트엔드 디자인이 확정되기 전, 백엔드만 먼저 구현하는 1단계 설계
**참고 원본**: `MCM_Nomad_Passport_개발_브리핑.md`, `MCM_Nomad_Passport_기획서_v6.docx`

## 1. 배경 및 스코프 결정

- 해커톤(멋쟁이사자처럼 14기 중앙 해커톤, SJF 트랙 Challenge 03)용 MVP.
- 프론트엔드는 디자인 미확정 상태라 **이번 단계에서 구현하지 않음**. 백엔드 API를 Postman/Swagger로 단위 검증하며 먼저 만든다.
- 마모 진단 AI 모델은 AI 파트 팀원(이현욱)이 별도로 만들어올 예정. 아직 연동 방식(REST 호출/모델 파일 내장 등) 미정 — 지금은 **순수 규칙기반**으로 구현하고, 인터페이스 하나로 나중에 교체 가능하게 설계한다.
- 구현 순서: 4-1(계정) → 4-2(여권 등록) → 4-3(마모 진단) → 4-4(타이밍 알림) → 4-5(타임라인).

## 2. 핵심 기술 결정

| 항목 | 결정 | 근거 |
|---|---|---|
| DB | PostgreSQL | JSONB로 진단 점수/알림 근거 같은 반정형 데이터 저장 용이, 개발자 채택률/기능 모두 MySQL보다 우위, Railway 1급 지원 |
| 파일 저장 | Cloudinary (외부 오브젝트 스토리지) | Railway 배포는 로컬 디스크가 휘발되어 지속성 없음. DB에 Base64로 넣는 것보다 코드도 단순하고 관리 부담도 적음 (URL만 DB에 저장) |
| 인증 | JWT, 이메일/비밀번호만 | 소셜 로그인·MCM 멤버십 연동은 외부 시스템 접근이 필요해 로드맵으로 연기 |
| 시리얼 OCR | 이번 단계는 수동 입력만 | 카메라/OCR 연동은 프론트엔드 합류 후 별도 진행 |
| 아키텍처 | 단일 Spring Boot 모놀리스, 패키지-바이-피처(도메인별 패키지) | 백엔드 담당 1인 체제라 마이크로서비스는 과설계. AI 삽입 지점은 인터페이스 분리로 충분히 해결 가능 |

## 3. 프로젝트 구조

```
src/main/java/com/mcm/passport/
├── account/        # 회원가입, 로그인, JWT 인증, 비밀번호 재설정, 탈퇴
├── passport/       # 여권 생성 & 제품 등록 (4-2)
├── diagnosis/      # 마모 진단 (4-3)
│   ├── WearDiagnosisEngine (인터페이스) ← AI 팀원 결과물 삽입 지점
│   └── RuleBasedWearDiagnosisEngine (현재 구현체)
├── notification/   # 타이밍 알림 (4-4) + 재진단 리마인드 스케줄러
├── care/           # 케어 기록 저장 (4-4)
├── timeline/        # 여권 타임라인 조회 (4-5, 다른 도메인 이력을 통합 조회)
└── common/         # Cloudinary 업로드, 전역 예외처리, JWT 필터
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

PasswordResetToken
├── id (PK)
├── accountId (FK → Account)
├── token
├── expiresAt
└── usedAt (nullable)

Passport                              # 제품 개체 1개 = 실물 가방 1개
├── id (PK)
├── serialNumber                      # 포맷: 신형 ^[A-Za-z]\d{4}$ 또는 빈티지 ^\d{4}$
├── purchaseYear                      # purchaseDate에서 등록 시 추출해 저장
│   └── UNIQUE (serialNumber, purchaseYear) WHERE status = 'ACTIVE'  ← 부분 유니크 인덱스
├── ownerAccountId (FK → Account)
├── modelName
├── nickname
├── purchaseDate, purchasePlace
├── receiptImageUrl (nullable, Cloudinary URL — 비공개 데이터, 공개 API에 절대 노출 금지)
├── hasReceiptTag (boolean)
├── baselineImageUrls (text[], Cloudinary URL)
├── usageFrequency (DAILY / FEW_TIMES_A_WEEK / OCCASIONAL / RARE) — 등록 시 자가신고, 설정에서 수정 가능
├── status (ACTIVE / DELETED) — 소프트 삭제
└── createdAt

Diagnosis                             # 마모 진단 1회 기록
├── id (PK)
├── passportId (FK → Passport)
├── diagnosisType (SELF / STORE)
├── imageUrls (text[], 비공개 데이터)
├── itemScores (JSONB)                # {마모, 코팅벗겨짐, 변색, 부자재상태} 0~100
├── overallGrade (GOOD / NEEDS_CARE / URGENT)
├── evidenceText
├── diagnosedAt
└── createdAt

Notification
├── id (PK)
├── passportId (FK → Passport)
├── type (SELF_CARE / STORE_SERVICE / REPURCHASE)
├── reasonFactors (JSONB)             # {마모도, 사용빈도, 계절, 구매경과일}
├── message
├── isRead, isDismissed (boolean)
└── createdAt

CareRecord
├── id (PK)
├── passportId (FK → Passport)
├── careType, materialType
├── notes, imageUrl
├── completedAt
└── createdAt

TimelineEvent                         # 사용자 직접 추가 이벤트 (사진+메모)
├── id (PK)
├── passportId (FK → Passport)
├── note, imageUrl
├── eventDate
└── createdAt
```

**관계**: `Account 1—N Passport`, `Passport 1—N {Diagnosis, Notification, CareRecord, TimelineEvent}`.

**타임라인 조회**는 별도 테이블 없이 `Passport` 생성시점 + `Diagnosis` + `CareRecord` + `Notification`(읽음 처리분) + `TimelineEvent`를 합쳐 시간순 정렬하는 조회 전용 로직으로 처리.

**정품 검증 범위**: 실제 MCM 시리얼 DB 접근이 없으므로 (1) 시리얼 포맷 정규식 검증 + (2) 위 복합 유니크 제약을 통한 중복 등록 거부로 한정.

## 5. API 엔드포인트

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

**notification**
```
GET    /api/passports/{id}/notifications    # 페이지네이션
PATCH  /api/notifications/{id}/read
PATCH  /api/notifications/{id}/dismiss
```
(생성 API 없음 — 진단 직후 트리거 + 스케줄러로만 생성)

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

## 6. 마모 진단 엔진

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
- **교체 지점**: `application.yml`의 `wear-diagnosis.engine: rule-based | ai` 설정값으로 `@ConditionalOnProperty` 스위칭. AI 팀원은 같은 인터페이스만 구현하면 됨.
- **AI 팀원과 사전 합의 필요**: `itemScores`의 키 이름(마모/코팅벗겨짐/변색/부자재상태)과 점수 스케일(0~100)을 미리 고정해서 구현체 교체 시 API 응답 포맷이 안 바뀌게 한다.

## 7. Lifecycle Curator (타이밍 알림 로직)

**입력**: 최신 Diagnosis.overallGrade/itemScores, Passport.usageFrequency, 현재 계절(시스템 날짜 기반), Passport.purchaseDate로부터의 경과일.

**Notification 생성 트리거 2가지**:
1. 진단 등록 직후 즉시 평가 — 결과가 NEEDS_CARE/URGENT면 바로 알림 생성
2. 스케줄러(매일 1회 cron) — `(현재일 - 최근진단일 또는 등록일 중 늦은 쪽) > 90일` && 최근 N일 내 미확인 리마인드 없음 → SELF_CARE 리마인드 생성 (스팸 방지)

**알림 유형 분기 (규칙기반)**:
- NEEDS_CARE → SELF_CARE (셀프케어 가이드 안내)
- URGENT → STORE_SERVICE (공식 서비스 예약 연결 — **실제 예약 시스템 아님, CTA 링크/안내 텍스트 수준**)
- 소유기간 장기 + 반복 URGENT 등 조건 → REPURCHASE 제안
- 구체 임계값은 구현 단계에서 AI/데이터 담당과 조율 가능하도록 설정값으로 분리

**셀프 케어 가이드 콘텐츠**(소재별·증상별 안내문)는 DB 테이블이 아니라 애플리케이션 내 정적 데이터로 관리 (내용 변경 빈도가 잦아지면 그때 DB로 승격).

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

## 9. 테스트 전략

- **단위 테스트**: `RuleBasedWearDiagnosisEngine` 점수 산출, Lifecycle Curator 알림 분기 로직 — 핵심 로직 우선.
- **통합 테스트**: Testcontainers로 실제 PostgreSQL 띄워서 Repository/Service 검증 (H2 미사용 — 운영 DB와 특성 차이로 인한 나중 삽질 방지).
- **API 검증**: Swagger UI/Postman 수동 확인이 메인.
- **회귀 테스트**: 등록→진단→알림→타임라인 핵심 플로우 1개는 RestAssured 등으로 엔드투엔드 자동화 (데모 전 회귀 확인용).

## 10. 비공개 데이터 취급 원칙

`Passport.receiptImageUrl`, `Diagnosis.imageUrls`는 기획서에 "비공개"로 명시된 데이터. 지금은 공유 기능이 없어 문제되지 않지만, **향후 어떤 공개용 API/DTO를 만들더라도 이 필드들은 절대 포함하지 않는다** (로드맵의 "이력 공유 링크" 마스킹 요구사항과 직결). 처음부터 "공개용 DTO"와 "본인용 DTO"를 분리해서 설계하는 것을 권장.

## 11. 이번 단계 범위 밖 (로드맵)

인증서 발급, 리세일&승계(소유권 이전, 이력 공유 링크, 소유 해제/인수), 발견&추천, 매장 경험(AR, 매장 체크인), 리캡&게이미피케이션, 설정&지원(다국어 등), 소셜 로그인, MCM 멤버십 연동, 실제 OCR/AI 연동. 발표 슬라이드로만 설명.

## 12. 참고: 저장소 분리

이 프로젝트 폴더(`MCM_Passport`)는 원래 자체 `.git` 없이 사용자 홈 디렉토리 전체 저장소에 얹혀 있었으나, 별도 git 저장소로 분리하여 이 스펙과 함께 첫 커밋으로 남겼다.
