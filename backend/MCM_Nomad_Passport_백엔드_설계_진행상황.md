# MCM Nomad Passport — 백엔드 설계 진행상황 (이어서 진행용)

> 이 파일은 브레인스토밍 세션에서 나온 모든 결정과 그 이유를 다음 세션이 그대로 이어받을 수 있도록 정리한 것입니다.
> 공식 설계 스펙은 `docs/superpowers/specs/2026-08-05-mcm-nomad-passport-backend-design.md`에 저장되어 있으며, 이 파일은 그 스펙이 나오기까지의 전체 맥락(질문-답변-근거)을 상세히 남긴 것입니다.

## 지금 무엇을 하고 있었나

브리핑 문서(`MCM_Nomad_Passport_개발_브리핑.md`)와 기획서 원본(`MCM_Nomad_Passport_기획서_v6.docx`)을 기반으로, **프론트엔드 디자인이 확정되기 전 단계에서 백엔드만 먼저 구현하기 위한 설계**를 브레인스토밍 방식(superpowers:brainstorming 스킬)으로 진행했고, 이어서 **superpowers:writing-plans**로 30개 태스크짜리 구현 계획까지 작성 완료했습니다. 이후 **superpowers:subagent-driven-development**로 태스크를 하나씩 순서대로 구현·리뷰하는 중입니다 (태스크마다: 구현 서브에이전트 디스패치 → 리뷰 서브에이전트 디스패치 → Important 이상 발견 시 수정 루프 → 원장 기록 → 다음 태스크).

**2026-08-09 세션은 Task 8(비밀번호 재설정) 구현 완료 + 리뷰 디스패치까지 하고 여기서 멈췄습니다** (사용자가 "오늘은 여기까지"라고 요청). 리뷰 결과가 아직 세션에 도착하지 않은 상태에서 중단 — 다음 세션에서 가장 먼저 할 일은 아래 "재개 방법"의 1번 항목. 이 파일은 태스크가 하나 끝날 때마다(리뷰 승인 시점마다) 계속 갱신됩니다. 상세 내용은 아래 "Task별 결과 요약" 섹션들 참고.

## 진행 상태 체크리스트

- [x] 프로젝트 컨텍스트 탐색 (브리핑 md + 기획서 docx 둘 다 읽음)
- [x] 이해한 내용 설명
- [x] 명확화 질문 (아래 "질문-답변-근거" 전체)
- [x] 접근 방식 제안 및 승인 (단일 모놀리스, 패키지-바이-피처)
- [x] 설계안 섹션별 제시 및 승인 (아키텍처 → 데이터모델 → API → 진단엔진 → 에러처리 → 테스트)
- [x] 설계 문서 작성 → `docs/superpowers/specs/2026-08-05-mcm-nomad-passport-backend-design.md`
- [x] **git 저장소 분리 완료.** `MCM_Passport` 폴더에 별도 `git init`으로 새 저장소를 만들고, 설계 스펙 + 이 진행상황 파일을 커밋함 (`25af30f`, `79f3b44`). 더 이상 홈 디렉토리 통짜 저장소와 섞이지 않음. 단, 원본 참고자료(`MCM_Nomad_Passport_개발_브리핑.md`, `MCM_Nomad_Passport_기획서_v6.docx`)는 아직 커밋 안 된 미추적 상태.
- [x] 스펙 셀프 리뷰 (플레이스홀더/모순/모호함 체크)
- [x] 사용자의 스펙 파일 최종 리뷰 → 승인함
- [x] **superpowers:writing-plans로 구현 계획 작성 완료** → `docs/superpowers/plans/2026-08-05-mcm-nomad-passport-backend.md` (30개 태스크, 커밋 `f484ae9`). 상세 내용은 아래 "구현 계획 요약" 섹션 참고.
- [x] 실행 방식 선택 → **Subagent-Driven Development** (태스크마다 새 서브에이전트 디스패치 + 태스크별 리뷰 + 최종 전체 리뷰)
- [x] **superpowers:subagent-driven-development 실행 시작.** 워크트리를 한 번 만들었다가 사용자 요청으로 다시 지우고 메인(브랜치 `main`)에서 바로 진행하기로 함.
- [x] SDD 원장(ledger) 생성: `.superpowers/sdd/2026-08-05-mcm-nomad-passport-backend/progress.md`
- [x] **Task 1 (프로젝트 스캐폴딩) 구현 완료 + 리뷰 통과(Approved).** 커밋 `61aa50d..73b8846`. Gradle wrapper도 이 태스크에서 함께 부트스트랩함(브리핑엔 없던 작업, 컨트롤러가 별도 지시). 상세는 아래 "Task 1 결과 요약" 참고.
- [x] **Task 2 (Testcontainers 통합테스트 인프라 + Flyway) 완료.** 커밋 `272c38b..56824e7`. Docker Desktop을 켰더니 Engine 29와 pinned testcontainers 1.20.1이 호환 안 되는 새 문제가 나와서 인간 승인 받고 1.21.4로 업그레이드. 상세는 "Task 2 결과 요약" 참고.
- [x] **Task 3 (전역 에러 처리 프레임워크) 완료.** 커밋 `a3a4812..0c7fd49` (수정 1라운드 포함). 상세는 "Task 3 결과 요약" 참고.
- [x] **Task 4 (Account 엔티티 + 리포지토리) 완료.** 커밋 `0c7fd49..be47954`. 리뷰 클린(수정 없음).
- [x] **Task 5 (회원가입 API) 완료.** 커밋 `be47954..a0d573f`. 리뷰 클린(수정 없음).
- [x] **Task 6 (JWT 인프라 + 로그인 API) 완료.** 커밋 `a0d573f..eb11db1` (수정 1라운드 포함). 상세는 "Task 6 결과 요약" 참고.
- [x] **Task 7 (프로필 조회/수정 API) 완료.** 커밋 `eb11db1..3232900`. 리뷰 클린(수정 없음). 상세는 "Task 7 결과 요약" 참고.
- [x] **Task 8 (비밀번호 재설정 API) 완료.** 커밋 `3232900..2f8da0b` (수정 1라운드 포함). 상세는 아래 "Task 8 결과 요약" 참고.
- [x] **Task 9 (회원 탈퇴, 계정만) 완료.** 커밋 `2f8da0b..ea37073`. 리뷰 클린(수정 없음). 상세는 아래 "Task 9 결과 요약" 참고.
- [x] **Task 10 (Passport 엔티티/리포지토리 + 부분 유니크 인덱스) 완료.** 커밋 `ea37073..63667a0`. 리뷰 클린(수정 없음). 부분 유니크 인덱스(`(serial_number, purchase_year) WHERE status='ACTIVE'`)가 실제 PostgreSQL(Testcontainers)로 검증됨. Minor 3건 원장에 기록(길이 제약 없음/리포지토리 파생쿼리 미검증/`receiptImageUrl` 등 비공개 필드가 엔티티 레벨엔 `@Getter`로 노출됨 — Task 13~14 DTO 만들 때 절대 노출 안 되게 주의).
- [x] **Task 11 (시리얼 번호 검증기) 완료.** 커밋 `63667a0..720956f`. 리뷰 클린(수정 없음, 이슈 0건).
- [x] **Task 12 (Cloudinary 이미지 저장소 추상화) 완료.** 커밋 `720956f..80aec19`. 리뷰 클린(수정 없음, 이슈 0건). `ImageStorageService` 인터페이스 뒤에 Cloudinary 격리 완료 — 이후 여권/진단 사진 업로드는 전부 이 인터페이스만 의존.
- [x] **Task 13 (여권 등록 API) 완료.** 커밋 `80aec19..251f632` (수정 1라운드 포함). SerialValidator/ImageStorageService/PassportRepository를 처음으로 통합. 리뷰에서 Important 1건 발견: 컨트롤러 `@RequestPart request`에 `@Valid`가 빠져서 검증 애노테이션이 죽어있었고, `purchaseDate` null이면 처리 안 된 500, `usageFrequency`/`modelName` null이면 DB NOT-NULL 위반이 `SERIAL_ALREADY_REGISTERED`로 잘못 매핑될 수 있었음(브리핑 자체의 결함, 구현자 잘못 아님) → `@Valid` 추가 + HTTP 레벨 통합테스트 2건 + DB 제약 경합 유닛테스트 1건 추가로 수정 → 재검토 통과. Minor 1건 원장에 기록(멀티파트 배열 바인딩 HTTP 레벨 테스트 없음).
- [x] **Task 14 (여권 목록/상세 조회) 완료.** 커밋 `251f632..fe9c035`. 리뷰 클린(수정 없음). 소유권 검증 순서(존재 여부 먼저 404, 그다음 소유자 아니면 403 — 존재 여부가 403으로 새지 않도록)까지 리뷰어가 정확히 확인함. `overallGrade`/`lastDiagnosedAt`은 Task 21까지 의도적으로 null. Minor 2건 원장에 기록(코스메틱: fully-qualified name 사용/테스트에 null 필드 검증 없음).
- [x] **Task 15 (여권 수정/삭제) 완료.** 커밋 `fe9c035..634bbdf`. 리뷰 클린(수정 없음). 브리핑의 Step 7이 `PassportControllerIntegrationTest.java`를 새 파일처럼 다뤘는데 실제로는 Task 13에서 이미 생겼던 파일이라, 기존 파일에 병합하고 검증된 `MockMultipartFile` 패턴을 쓰도록 지시 → 리뷰어가 정확히 반영됐는지 확인함. 재등록 회귀 테스트(등록→소프트삭제→재등록)가 실제 Postgres(Testcontainers)로 엔드투엔드 통과. Minor 2건 원장에 기록(PATCH 바디 `@Valid` 없음/update·delete 전용 FORBIDDEN·NOT_FOUND 테스트 없음, 둘 다 브리핑 그대로+저위험).
- [x] **Task 16 (회원탈퇴 → 여권 소프트삭제 연쇄 처리) 완료.** 커밋 `634bbdf..bfdfdf2`. 리뷰 클린(수정 없음). `AccountService`가 `PassportRepository`에 의존하게 되는 크로스 패키지 연결(스펙상 의도된 설계). 반복 탈퇴 호출 시 이미 삭제된 여권에 `softDelete()`가 재호출되는지도 리뷰어가 확인 — 부작용 없는 진짜 no-op으로 확인됨(Task 7~9에서 반복 지적된 `getActiveAccountOrThrow` 이슈와는 별개로, 이 캐스케이드 자체는 안전함).
- **✅ Task 10~16 "4-2 여권 등록" 그룹 전체 완료** (커밋 `ea37073..bfdfdf2`). 다음은 Task 17부터 "4-3 마모 진단" 그룹.
- [x] **Task 17 (Diagnosis 엔티티/리포지토리) 완료.** 커밋 `bfdfdf2..e25cb26`. 리뷰 클린(수정 없음). `com.mcm.passport.diagnosis` 패키지 시작(마모 진단 도메인). 브리핑 테스트가 `passportId=1L` 하드코딩을 썼는데 브리핑 자체의 마이그레이션이 `passport_id REFERENCES passport(id)` FK를 걸어놔서 실제로는 불가능했음 → 구현자가 `PassportRepositoryTest` 패턴대로 실제 Account+Passport 생성하도록 수정, 리뷰어 확인 완료. Minor 1건 원장에 기록(두 진단을 연속 저장하고 `diagnosedAt` 기준 정렬 검증하는 테스트에 2차 정렬 기준이 없어 이론상 타이밍 flaky 가능성 — 브리핑 원본 그대로, 실제 발생은 안 함).
- [x] **Task 18 (규칙기반 마모 진단 엔진 + AI 교체 지점) 완료.** 커밋 `e25cb26..4a25907` (수정 1라운드 포함). `WearDiagnosisEngine` 인터페이스로 AI팀 교체 지점 확보(`wear-diagnosis.engine` 설정). 리뷰어가 산술식(마모 점수 증가/캡/등급 임계값)을 직접 검산해서 정확함 확인. Important 1건(plan-mandated): `imageUrls`가 null이면 NPE 나는 문제가 브리핑 원본 코드에 있었음 → null을 빈 리스트로 처리하도록 방어 코드 추가 + 4개 itemScores 키 전부 검증하는 테스트 보강 → 재검토 통과. Minor 2건 원장에 기록(매직넘버/일부 fallback 경로 미검증).
- [x] **Task 19 (진단 등록 API) 완료.** 커밋 `4a25907..86ba529` (수정 1라운드 포함, **사용자 확인 필요해서 질문 후 진행**). 브리핑의 컨트롤러 코드(`@RequestPart("diagnosisType") DiagnosisType`)가 실제로는 클라이언트가 `Content-Type: application/json` + JSON-quoted 값으로 안 보내면 415가 나고, 이 에러가 앱 표준 `{code,message}` 형식을 벗어나는 걸 구현자가 직접 검증해서 발견함 — 모바일 앱이 예정된 프론트엔드라 일반 폼 필드로는 이 API를 못 쓰는 상황. 수정안이 브리핑 원문(컨트롤러 애노테이션)을 바꾸는 거라 **AskUserQuestion으로 4개 옵션 제시 → "@RequestParam으로 전환" 선택받음** → 수정 + 이 엔드포인트의 첫 컨트롤러 레벨 통합테스트(일반 폼 필드 인코딩으로 실제 검증) 추가 → 재검토 통과.
- [x] **Task 20 (진단 목록/상세 조회) 완료.** 커밋 `86ba529..491930d` (수정 1라운드, **사용자 확인 필요해서 질문 후 진행**). 브리핑의 `assertOwnership`이 여권 상태(ACTIVE)를 필터링 안 해서, 소프트 삭제된 여권의 진단 이력이 계속 조회 가능했음 — `PassportService`(Task 14)/`submit`(Task 19)은 전부 ACTIVE만 허용하는데 이것만 예외인 불일치였음. "의도된 감사로그 예외" vs "일관성 우선 수정" 두 옵션 제시 → **ACTIVE 필터 추가로 결정** → 수정 + 소프트삭제 여권 접근 시 404 되는 회귀 테스트 추가 → 재검토 통과.
- [x] **Task 21 (여권 목록에 최신 진단정보 반영) 완료.** 커밋 `491930d..c686b81`. 리뷰 Approved(수정 루프 없음). 전 세션에서 미커밋 상태로 남았던 구현(Step 1/2/4)이 브리핑과 정확히 일치함을 확인 후, 이번 세션에서 테스트 실행(`PassportServiceTest` 10/10 통과)·컴파일·커밋만 이어서 완료. `PassportService`가 `DiagnosisRepository`에 의존하는 3번째 크로스 패키지 연결. 리뷰에서 N+1 쿼리 패턴(목록 조회 시 페이지당 진단 조회 1회씩)을 Important로 짚었으나, 이미 사전 설계 단계에서 현재 규모엔 허용 가능하다고 승인된 트레이드오프라 수정 없이 승인 확정.
- **✅ Task 17~21 "4-3 마모 진단" 그룹 전체 완료** (커밋 `bfdfdf2..c686b81`). 다음은 Task 22부터 "4-4 타이밍 알림·케어" 그룹.
- [x] **Task 22 (Notification 엔티티, MILESTONE 타입+overallScore 포함) 완료.** 커밋 `a5a5f94..3b5959d`. 리뷰 Approved(이슈 0건). 구현 에이전트가 Docker Desktop 재시작과 겹쳐 멈춘 동안 컨트롤러가 직접 이어받아 커밋 — 나중에 원래 에이전트가 되살아나 자기 결과물이 이미 커밋된 것과 byte-identical임을 스스로 확인, 문제 없음.
- [x] **Task 23 (Lifecycle Curator 알림 분기 로직, overallScore 평균 계산 포함) 완료.** 커밋 `3b5959d..13a0d45`. 리뷰 Approved(Minor 2건만 보류: 테스트가 overallScore 값 자체는 미검증, 단일 항목 맵으로만 반올림 테스트).
- [x] **Task 24 (진단↔알림 연결) 완료.** 커밋 `c30e394..8e245aa` (수정 1라운드). 브리핑 원문에 알림 평가 실패 시 진단 등록 전체가 실패하는 결함이 있어(plan-mandated), 진단 등록이 데모 핵심 흐름이라는 판단으로 try-catch 방어 추가 결정.
- [x] **Task 25 (알림 목록/읽음/무시) 완료.** 커밋 `8e245aa..1014426` (수정 1라운드). `NotificationService`에 `@Transactional` 누락 발견·수정(안 하면 읽음/무시 처리가 DB에 반영 안 됨) — `AccountService`/`PassportService`와 동일 패턴으로 통일.
- [x] **Task 26 (재진단 리마인드 스케줄러 + 마일스톤) 완료.** 커밋 `1014426..c32619f`. 이 태스크가 `NotificationService` 전체를 덮어쓰는 구조라, Task 25의 `@Transactional` 수정이 계획 문서 원본 코드에 반영 안 돼 있던 걸 디스패치 전에 미리 발견·수정(리뷰어가 되돌아가지 않았음을 재확인).
- [x] **Task 27 (케어 기록 저장) 완료.** 커밋 `f56927b..4562c69`. 리뷰 클린.
- [x] **Task 28 (사용자 타임라인 이벤트 + eventType) 완료.** 커밋 `4562c69..93a3ef0`. 리뷰에서 `@Column(length=...)` 누락을 Important로 지적했으나, 이미 Task 4·Task 10에서 두 번이나 "ddl-auto=validate는 length를 검사 안 해서 무해함"으로 확인된 사안이라 Minor로 재분류(수정 루프 생략).
- [x] **Task 29 (통합 타임라인 조회) 완료.** 커밋 `93a3ef0..5e14ccb`. 리뷰 클린, 편차 없음.
- [x] **Task 30 (엔드투엔드 회귀 테스트) 완료 — 원래 30개 태스크 계획 전체 완료.** 커밋 `5e14ccb..5205cad`. 전체 테스트 스위트(`./gradlew test`)가 이 로컬 환경(Windows/WSL2/Docker Desktop)에서 산발적으로 실패하는 문제를 발견 — Testcontainers Postgres 연결이 여러 Spring 컨텍스트가 연속으로 뜰 때 간헐적으로 타임아웃(HikariCP 30초). Docker/WSL 완전 재시작, 5회 반복 실행, 설정 수정 시도(오히려 악화되어 되돌림) 등 충분히 조사한 결과 **코드 결함이 아니라 로컬 인프라 특성으로 결론**. 개별/소규모 배치로 테스트하면 항상 통과함(이번 세션 전체에서 실증됨). 상세 내용은 `task-30-report.md` 참고.
- **다음 세션 CI/로컬 검증 시 참고**: 전체 스위트 한 번에 돌리지 말고 클래스별/소규모로 나눠서 확인할 것.
- [ ] Task 31~34 (신규 여권 승계): 아직 시작 안 함.

## 다음 세션 재개 방법 (Task 21부터)

1. **가장 먼저 Task 21 상태 확인**: `task-21-report.md`가 있는지, 커밋이 됐는지(`git log`) 확인. 커밋됐으면 `base=491930d head=<커밋>`으로 리뷰 패키지 생성 후 태스크 리뷰어 디스패치. 커밋 안 됐으면 작업트리 diff를 `task-21-brief.md`(Step 1~6)와 대조해서 어디까지 됐는지 확인 → 이어서 진행하거나 처음부터 재디스패치.
2. 이후 **superpowers:subagent-driven-development**로 Task 22부터 계속(Task 1~20은 전부 완료·리뷰통과 확정 — 커밋 `61aa50d..491930d`).
3. 태스크 완료마다 이 파일 + `.superpowers/sdd/.../progress.md` 원장 갱신 습관 유지.
4. **누적된 사용자 확인 필요 이슈 (final review 전 재확인)**: `getActiveAccountOrThrow`의 `isActive` 미필터링 문제(Task 7/8/9, 아직 미해결 — 후보 수정: `.filter(Account::isActive)` 추가, 호출부 4곳 일괄 적용).

## 질문-답변-근거 전체 기록

브레인스토밍 중 나온 모든 의사결정과 그 이유입니다. 나중에 "왜 이렇게 정했더라?"를 다시 물어볼 필요 없게 전부 남깁니다.

1. **AI 마모진단 모델 연동 방식** → 아직 미정, 우선 순수 규칙기반으로만 개발. AI 팀원(이현욱)이 나중에 모델을 만들어오면 인터페이스(`WearDiagnosisEngine`)만 구현하는 형태로 붙일 것.
2. **테스트/데모 방식** → 프론트엔드가 없으므로 Postman/Swagger로 API 단위 확인.
3. **DB 선택** → PostgreSQL. (사용자가 "MySQL이 더 가벼운 것 아니냐"고 물어서, 실제로는 반대이며 JSONB·pgvector 확장성·Railway 지원·개발자 채택률 모두 PostgreSQL 우위라고 설명 후 확정.)
4. **구현 순서** → 4-1(계정) → 4-2(등록) → 4-3(진단) → 4-4(알림) → 4-5(타임라인). 회원가입을 더미로 건너뛰지 않고 처음부터 제대로 구현하기로 함 (다른 모든 API의 소유자 검증 전제조건이라서).
5. **파일 저장소** → Cloudinary 등 외부 오브젝트 스토리지. (사용자가 "오브젝트 스토리지가 더 관리 빡세지 않냐"고 물어서, 실제로는 Base64를 DB에 넣는 것보다 코드도 단순하고 DB 부담도 없다고 설명 후 확정. Railway 배포는 로컬 디스크가 휘발되어 지속성이 없다는 게 핵심 이유.)
6. **시리얼 OCR** → 이번 단계는 수동 입력만 구현. 실제 OCR(카메라) 연동은 프론트엔드 합류 후.
7. **회원가입 범위** → 이메일/비밀번호만. 소셜 로그인과 MCM 기존 멤버십 연동은 외부 시스템 접근이 필요해 로드맵으로 연기.
8. **전체 아키텍처** → 단일 Spring Boot 모놀리스, 패키지-바이-피처 구조. (마이크로서비스로 진단 서비스만 분리하는 안도 검토했으나, 백엔드 담당이 사실상 1명이라 오버엔지니어링으로 판단, 기각. WearDiagnosisEngine 인터페이스 분리만으로 AI 교체 유연성은 충분히 확보됨.)

### 데이터 모델 검토 라운드에서 나온 추가/수정 사항
- **비밀번호 재설정** 누락 발견 → `PasswordResetToken` 엔티티 추가.
- **회원 탈퇴** 누락 발견 → `Account.status`(ACTIVE/WITHDRAWN) + `withdrawnAt` 추가. 탈퇴 시 소유 Passport 전체를 `DELETED`로 연쇄 처리하기로 결정.
- **사용빈도(usageFrequency)** 데이터를 담을 곳이 없었음 → `Passport.usageFrequency` 필드 추가. "쓸 때마다 보고"가 아니라 **등록 시 1회 자가신고 + 설정에서 수정 가능**한 방식으로 구현 (사용자가 "매번 자가신고는 말이 안 된다"고 지적해서 방식을 이렇게 명확히 함).
- **`CareRecord` 엔티티 자체가 통째로 빠져 있었음** → 4-4의 "케어 기록 저장" 요구사항 반영해서 추가.
- **`Passport.status`를 boolean이 아니라 확장 가능한 enum(ACTIVE/DELETED)으로** → 로드맵의 "소유 해제"(RELEASED 상태 추가 예정)를 감안해 나중에 스키마 재작업 없도록 미리 설계.
- **상세조회 엔드포인트 대칭성** → `care-records/{id}`, `timeline/events/{id}` 상세 API 누락 발견 후 추가.
- **목록 API 페이지네이션** → 처음부터 `page`/`size` 파라미터 반영 (나중에 추가하면 API 스펙 깨짐).
- **영수증/진단 사진의 "비공개" 취급** → 기획서 원본에 "영수증 원본·진단 원본 사진은 전부 마스킹"이라고 명시된 걸 확인 후, 앞으로 어떤 공개용 API/DTO에도 이 필드들을 절대 넣지 않는다는 원칙을 스펙에 명문화.

### 기획서 원본(docx)을 읽고 나서 발견한 핵심 이슈 — **시리얼 번호 유일성 문제**
기획서 1번(배경) 섹션에 "시리얼 자체의 조합 가짓수가 크지 않은 만큼, 개체 식별은 시리얼 단독이 아니라 구매년도·등록시점과 결합한 방식으로 설계할 필요는 있다"는 문장이 있었음. 실제 시리얼 포맷은:
- 신형: 영문자 1개 + 숫자 4자리 (`^[A-Za-z]\d{4}$`, 최대 약 26만 가지)
- 빈티지: 숫자 4자리 (`^\d{4}$`, 최대 1만 가지)

이 정도 조합 수면 서로 다른 정품 두 개가 우연히 같은 시리얼을 가질 수 있음. 처음엔 `Passport.serialNumber` 단독에 unique 제약을 걸려고 했는데, 이러면 실제로 다른 정품인데 시리얼이 겹쳐서 등록이 잘못 거부될 수 있었음. **해결**: unique 제약을 `(serialNumber, purchaseYear)` 복합키로 변경. `purchaseYear`는 `purchaseDate`에서 등록 시 추출해 별도 컬럼으로 저장. 추가로, 신형/빈티지를 사용자가 직접 선택하게 할 필요는 없음 — 두 포맷이 구조적으로 겹치지 않아서 정규식 두 개 중 하나만 통과하면 되는 걸로 충분.

이후 "삭제(소프트 삭제)된 여권과 같은 시리얼+구매년도로 재등록이 가능해야 하는가?"를 물었고, 사용자가 "잘못 등록했을 때 수정도 가능해야 하니 허용하는 게 좋겠다"고 답해서 → **부분 유니크 인덱스** `UNIQUE (serialNumber, purchaseYear) WHERE status = 'ACTIVE'`로 확정.

### 그 외 세부 결정 (재검토 라운드에서 명확히 함)
- Notification 생성은 **2가지 트리거**: ① 진단 등록 직후 즉시 평가, ② 스케줄러(매일 1회, 90일 초과 && 최근 리마인드 없음 조건)로 리마인드 생성.
- 셀프 케어 가이드 콘텐츠(소재별·증상별 안내문)는 DB 테이블이 아니라 애플리케이션 내 정적 데이터로 관리 (내용 변경이 잦아지면 그때 DB로 승격).
- "공식 서비스(매장) 예약 연결"은 실제 예약 시스템이 아니라 CTA 링크/안내 텍스트 수준으로 스코프를 좁힘.

## 팀 구성 (기획서 docx 기준, 브리핑 md보다 상세)

| 파트 | 담당자 | 비고 |
|---|---|---|
| AI/데이터 | 이현욱 | 마모 진단 로직 설계, Lifecycle Curator 판단 근거 산출. Backend(Spring Boot, Java, MySQL)도 다룰 줄 앎 |
| 프런트엔드 | 심지윤 | 핵심 데모 화면(등록→진단→알림→타임라인) 구현 |
| 백엔드 | 정준영 | 여권·진단·알림 데이터 저장 구조 설계, API 연동. 이 기획서 작성 및 리서치 전반 주도 |
| 기획 | 김예란 | MCM 브랜드 자산 조사, 심사기준 대응, 피칭 스토리 구성 |

## 해결된 이슈 (참고용)

**git 저장소 문제 (해결됨)**: 원래 `MCM_Passport` 폴더는 자체 `.git`이 없이 `C:\Users\dnflt` 홈 디렉토리 전체 저장소에 얹혀 있어서, 이 프로젝트와 무관한 다른 작업 히스토리와 섞여 있었음. `MCM_Passport` 폴더 안에 `git init`으로 새 저장소를 만들어 분리했고, 설계 스펙과 이 진행상황 파일을 첫 커밋으로 남김.

## 구현 계획 요약

`docs/superpowers/plans/2026-08-05-mcm-nomad-passport-backend.md` (총 30개 태스크, 스펙 순서 그대로):

- **Task 1-9 (4-1 계정)**: Gradle 스캐폴딩 → Testcontainers 통합테스트 기반 → 전역 에러처리 → Account/PasswordResetToken 엔티티 → 회원가입 → JWT+로그인 → 프로필 조회/수정 → 비밀번호 재설정 → 회원탈퇴(계정만)
- **Task 10-16 (4-2 여권 등록)**: Passport 엔티티(부분 유니크 인덱스 `(serialNumber, purchaseYear) WHERE status='ACTIVE'`) → 시리얼 검증기 → Cloudinary 이미지 저장소 → 등록 API → 목록/상세 조회 → 수정/삭제 → 회원탈퇴 연쇄처리 연결
- **Task 17-21 (4-3 마모 진단)**: Diagnosis 엔티티 → 규칙기반 진단엔진(AI 교체 지점 `WearDiagnosisEngine` 인터페이스) → 진단 등록 API → 진단 목록/상세 → 여권 목록에 진단 정보 반영
- **Task 22-26 (4-4 타이밍 알림)**: Notification 엔티티 → Lifecycle Curator 규칙 로직 → 진단↔알림 연결 → 알림 목록/읽음/무시 → 재진단 리마인드 스케줄러
- **Task 27-30 (4-5 케어/타임라인)**: 케어 기록 API → 사용자 타임라인 이벤트 API → 통합 타임라인 조회 API → 엔드투엔드 회귀 테스트

각 태스크는 TDD 사이클(실패 테스트 → 실패 확인 → 구현 → 통과 확인 → 커밋)로 구성되어 있고, 태스크 간 생성자 시그니처 변경(예: `AccountService`, `PassportService`, `DiagnosisService`, `NotificationService`가 뒤 태스크에서 의존성이 늘어남)에 대한 정확한 수정 지침까지 플랜 셀프리뷰에서 다 박아뒀습니다.

## Task 1 결과 요약 (2026-08-06 세션)

- 커밋: `61aa50d..73b8846` (`chore: scaffold Spring Boot project with health check`, `fix: mark gradlew as executable in git index`)
- Gradle wrapper를 이 태스크에서 함께 부트스트랩함 (Gradle 8.8 고정). 기존에 `gradlew`도 전역 `gradle`도 없었음.
- **플랜 문서 자체의 결함 하나 발견 및 수정**: `task-1-brief.md`(플랜의 Task 1)에 있는 `HealthControllerTest.java`를 그대로 쓰면 `spring-boot-starter-security`가 클래스패스에 있고 `SecurityConfig`가 아직 없어서(Task 6에서야 생김) 401을 반환함(200 기대와 불일치). `@AutoConfigureMockMvc(addFilters = false)`를 테스트에 추가해서 최소 범위로 해결 — 리뷰어가 원인과 해결책 모두 독립 검증함. Task 6에서 `SecurityConfig`가 생겨도 이 테스트는 그대로 통과함(추가 조치 불필요).
- 리뷰 결과: **Spec Compliant, Task quality: Approved**. Minor로 하나 남음 — Task 6(SecurityConfig)에서 `/api/health`가 실제로 인증 없이 200 응답하는지 검증하는 통합 테스트를 추가하면 좋음(원장에 기록해둠, Task 6 디스패치 시 같이 전달할 것).
- 원장(ledger) 파일: `.superpowers/sdd/2026-08-05-mcm-nomad-passport-backend/progress.md`

## Task 2 결과 요약

- 커밋: `272c38b..56824e7` (`test: add Testcontainers-based integration test base`, `fix: override Spring Boot BOM to pin testcontainers 1.21.4 for Docker Engine 29 compatibility`)
- 파일 3개(`V1__create_account_tables.sql`, `AbstractIntegrationTest.java`, `AbstractIntegrationTestBootTest.java`) 전부 브리핑 verbatim 그대로 작성 — 텍스트 편차 없음.
- **환경 블로커 발생 → 인간 승인 받고 해결.** Docker Desktop을 켰더니(Task 1에서 데몬 꺼져 있던 문제는 해결) 이번엔 **Docker Engine 29(신버전)와 브리핑에 pinned된 testcontainers 1.20.1이 근본적으로 호환 안 되는** 별개의 새 문제 발견 (알려진 업스트림 이슈, `testcontainers-java#11235`). 구현자가 정확히 진단(Docker는 정상 실행 중이지만 testcontainers가 번들한 구버전 `docker-java` 클라이언트가 새 Docker Engine API를 협상 못 함)하고 BLOCKED로 보고.
  - **인간에게 선택지 4개 제시 → "1.21.x대로 버전 업" 선택.** (2.0.x 메이저 업그레이드는 컨테이너 클래스 패키지가 전면 개편되어 이후 모든 태스크의 verbatim import 문을 다 고쳐야 해서 배제, Docker Desktop 다운그레이드도 배제.)
  - 첫 시도(버전 번호만 1.21.4로 변경)는 실패 — Spring Boot의 `io.spring.dependency-management` BOM이 명시적 버전을 무시하고 1.19.8로 강제 다운그레이드하는 걸 재확인. **`ext['testcontainers.version'] = '1.21.4'`로 BOM 자체를 오버라이드**해야 실제로 해결됨(구현자가 스스로 재진단하고 두 번째 시도에서 해결).
  - 이 편차는 **의도적이고 인간 승인됨** — 앞으로 모든 태스크는 testcontainers 1.21.4가 이 프로젝트의 실제 고정 버전이라고 가정하면 됨.
- 리뷰 결과: **Spec Compliant, Task quality: Approved** (수정 루프 없이 클린 승인 — build.gradle 편차는 사전 승인된 것이라 리뷰 대상에서 제외하고 올바르게 구현됐는지만 확인).
- Minor 2건 원장에 기록(둘 다 브리핑 verbatim이라 이 태스크의 결함 아님): postgres 이미지 patch 버전 미고정, 스모크 테스트에 명시적 assertion 없음.

## Task 3 결과 요약

- 커밋: `a3a4812` → 리뷰에서 Important 1건 발견 → 수정 → `0c7fd49`
- 4개 메인 파일(`ErrorCode`, `ApiException`, `ErrorResponse`, `GlobalExceptionHandler`)은 브리핑 verbatim 그대로. **테스트 파일에서 구현자가 임의로 브리핑과 다른 접근을 사용**한 게 리뷰에서 걸림: 브리핑은 `@WebMvcTest`(실제 Spring 컴포넌트 스캔으로 `@RestControllerAdvice`가 진짜 인식되는지 검증)를 지시했는데, 구현자는 Spring Security 401 문제에 부딪히자 `MockMvcBuilders.standaloneSetup()`(컨트롤러 어드바이스를 수동으로 강제 등록)으로 우회함.
  - **리뷰어가 정확히 지적**: `standaloneSetup()` 방식은 `@RestControllerAdvice` 애노테이션을 지워도 테스트가 여전히 통과하는 구조라서, "전역 예외 핸들러가 실제로 Spring에 의해 발견되는지"라는 이 테스트의 존재 이유 자체를 무력화함.
  - **수정**: Task 1의 `HealthControllerTest`가 이미 확립해둔 정석 패턴(`@AutoConfigureMockMvc(addFilters = false)` + 진짜 `@WebMvcTest`)으로 재작성 → 재검토 통과.
- 리뷰 결과: **Spec Compliant, Task quality: Approved** (수정 1라운드 후). Minor 1건: `@Import(GlobalExceptionHandler.class)`가 사실 불필요(중복이지만 무해).
- **교훈**: 이후 태스크(4, 5, 6) 디스패치 지시문에, "브리핑의 verbatim 테스트 코드가 장애물에 부딪히면 기존에 확립된 정석 패턴(`addFilters=false`)을 쓰고, 구조를 임의로 바꾸지 말 것"이라는 명시적 지침을 계속 포함시킴 — Task 4, 5는 이 지침 덕분인지 편차 없이 클린 승인됨.

## Task 4, 5 결과 요약

- **Task 4 (Account 엔티티+리포지토리)**: 커밋 `0c7fd49..be47954`. 브리핑 verbatim 그대로, 편차 없음. 리뷰어가 특히 `Account`/`PasswordResetToken` 엔티티와 Task 2의 `V1__create_account_tables.sql` 마이그레이션이 컬럼 단위로 정확히 일치하는지(=`ddl-auto: validate` 하에서 부팅 가능한지) 별도로 검증 — 일치 확인. **Spec Compliant, Approved, 수정 없음.** Minor 3건(전부 브리핑 verbatim이라 이 태스크 결함 아님): `PasswordResetToken.accountId`가 `@ManyToOne` 대신 raw `Long`, 엔티티 메서드 단위 테스트 없음, `nickname`에 `@Column(length=100)` 없음.
- **Task 5 (회원가입 API)**: 커밋 `be47954..a0d573f`. 브리핑 verbatim 그대로, 편차 없음. 리뷰어가 비밀번호가 실제로 해싱되어 저장되는지, 중복 이메일이 정확한 `ErrorCode`로 거부되는지 확인. **Spec Compliant, Approved, 수정 없음.**

## Task 6 결과 요약

- 커밋: `a1f69ea` → 리뷰에서 Important 1건 발견 → 수정 → `eb11db1`
- 이 앱에서 **최초로 실제 `SecurityConfig`/`SecurityFilterChain`이 생기는** 보안 핵심 태스크. JWT 발급/검증(`JwtTokenProvider`), 인증 필터(`JwtAuthenticationFilter`), 로그인 API까지 구현.
- **자체 발견 편차 1건 (필요한 수정, 인간 재확인 불필요한 수준)**: 브리핑의 `SecurityConfig` verbatim 코드가 `JwtProperties`(`@ConfigurationProperties` 레코드)를 Spring 빈으로 등록하는 절차를 빠뜨려서 앱이 부팅 자체가 안 됨. `@EnableConfigurationProperties(JwtProperties.class)`를 `SecurityConfig`에 추가해서 해결 — 리뷰어가 브리핑 텍스트를 직접 대조해서 "진짜 빠져 있었다"는 것과 수정 범위가 적절한지 독립 검증함.
- **회귀 위험 특별 점검**: Task 1의 `HealthControllerTest`, Task 3의 `GlobalExceptionHandlerTest`는 `SecurityConfig`가 없던 시절에 `addFilters = false`로 우회하며 작성된 테스트였는데, 이번에 진짜 `SecurityConfig`가 생기면서 이 두 테스트가 깨지지 않는지 별도로 확인 지시 → 전체 스위트 통과로 회귀 없음 확인.
- **리뷰에서 Important 1건 발견**: Task 1 리뷰 때 "Task 6에서 SecurityConfig 생기면 `/api/health` 무인증 200을 검증하는 통합 테스트를 추가하라"고 원장에 남겨뒀던 항목이 이번 브리핑엔 없어서 구현자가 빠뜨림 (구현자가 스스로 보고서에 "이 항목은 몰라서 못했다"고 정직하게 명시). **컨트롤러가 이 이력을 추적하고 있다가 리뷰어에게 별도로 확인 지시** → 리뷰어가 실제로 누락 확인 → Important로 격상.
  - **수정**: `HealthEndpointSecurityTest.java` 신규 추가 — `AbstractIntegrationTest`(진짜 필터체인 활성화, `addFilters=false` 없음) 기반으로 무인증 `/api/health` 요청이 실제로 200을 반환하는지 엔드투엔드 검증. 재검토에서 ADDRESSED 확인.
- 리뷰 결과: **Spec Compliant, Task quality: Approved** (수정 1라운드 후). 보안 핵심 체크(권한 분기, 비밀번호 `matches()` 사용, 로그인 실패시 이메일 존재 여부 노출 안 함, JWT 검증 예외 처리) 전부 리뷰어가 별도로 검증하고 문제 없음 확인. Minor 3건 원장에 기록(전부 브리핑 verbatim이거나 이 태스크 범위 밖): 401 응답 JSON이 `ErrorResponse` 재사용 대신 문자열 하드코딩, 필터 레벨 단위 테스트 없음, 커밋된 fallback JWT 시크릿 값(실배포 시 `JWT_SECRET` 환경변수 필수 설정 확인 필요).

## Task 7 결과 요약

- 커밋: `3232900` (`feat: add account profile get/update endpoints`) — 수정 루프 없이 클린 승인.
- `GET`/`PATCH /api/account/me` 구현. **인증 신원 확인이 핵심 검증 포인트**였음 — 리뷰어가 클라이언트가 body/path로 account id를 보내는 게 아니라, `Authentication`/`CurrentAccount.id()`(서버가 발급하고 서명 검증한 JWT의 subject)로만 대상 계정을 특정하는지 코드 경로를 직접 추적해서 확인함(스푸핑 불가 확인).
- **자체 발견 편차 1건 (필요한 수정)**: 브리핑의 `AccountControllerIntegrationTest` verbatim 코드에 `@AutoConfigureMockMvc`가 빠져 있어서 `MockMvc` 빈을 못 찾는 에러 발생. Task 6의 `HealthEndpointSecurityTest`가 이미 확립한 정확히 같은 패턴(`@AutoConfigureMockMvc` + 진짜 필터체인, `addFilters=false` 없음)으로 해결 — 리뷰어가 브리핑 텍스트 대조, 근본원인, 선례 일치 여부까지 전부 독립 검증함. **Task 3 이후 계속 강조해온 "정석 패턴 따르기" 지침이 이번에도 정확히 작동함.**
- 리뷰 결과: **Spec Compliant, Task quality: Approved, 수정 없음.** Minor 3건 원장에 기록:
  - `AccountService.getActiveAccountOrThrow`가 이름과 달리 실제로는 `Account::isActive` 필터링을 안 함(브리핑 verbatim, `login()`은 필터링하는데 이건 안 함) → **탈퇴한 계정도 아직 유효한 JWT가 있으면 프로필 조회/수정이 가능할 수 있음.** 이 태스크의 결함은 아니고 플랜 자체의 잠재적 이슈 — Task 9(회원 탈퇴)에서 이 문제가 실제로 어떻게 다뤄지는지 확인 필요.
  - 브리핑 verbatim 코드의 미사용 import 1개(무해).
  - PATCH 엔드포인트의 통합 테스트 없음(유닛 테스트만 있음, 브리핑이 요구 안 함).

## Task 8 결과 요약 (2026-08-10 세션)

- 지난 세션(2026-08-09)에서 구현은 끝났지만(커밋 `0d1fbdb`) 리뷰 서브에이전트 결과가 도착하기 전에 세션이 끊겼음. 이번 세션 시작 시, 저장돼 있던 리뷰 패키지(`review-3232900..0d1fbdb.diff`)를 그대로 재사용해 리뷰어를 재디스패치함.
- **리뷰 결과: Needs fixes.** 구현(비밀번호 재설정 로직, 이메일 존재 여부 비노출)은 정확했지만, Important 3건이 전부 **테스트 커버리지 공백**이었음:
  1. `confirmPasswordReset` 성공 경로(정상 토큰으로 실제 비밀번호가 바뀌는지) 검증 테스트 없음
  2. anti-enumeration 자체(존재하지 않는 이메일로 요청 시 저장소/메일러 호출이 안 되는지)를 검증하는 테스트 없음 — 가장 조용히 회귀할 수 있는 항목인데 미검증 상태였음
  3. 이미 사용된 토큰 재사용(replay) 방지 테스트 없음(만료 분기만 테스트돼 있었음)
- **수정 1라운드**: 새 구현 서브에이전트(원 구현자는 이전 세션 소속이라 재개 불가라서 새로 디스패치)가 `AccountServiceTest.java`에 테스트 3개 추가(`confirmPasswordResetChangesPasswordAndMarksTokenUsed`, `requestPasswordResetDoesNothingForUnknownEmail`, `confirmPasswordResetRejectsUsedToken`) → 커밋 `2f8da0b`. 21/21 통과.
- **재검토(scoped re-review)**: 3건 전부 ADDRESSED, 새로운 회귀 없음, 21/21 통과 확인 → 승인.
- Minor 3건 원장에 기록(전부 deferred): `confirmPasswordReset`이 `Account::isActive`를 확인 안 함(탈퇴 계정도 비밀번호 재설정 가능할 수 있음 — Task 7의 이슈와 같은 계열, Task 9에서 이 계열 문제를 해결하는지 확인 필요), 기존 미사용 토큰을 새 요청 시 무효화 안 함(TTL 30분으로 노출 범위는 제한적), 신규 엔드포인트 2개의 컨트롤러/통합 테스트 없음(브리핑이 서비스 레벨만 요구).
- 리뷰 결과: **Spec Compliant, Task quality: Approved** (수정 1라운드 후).

## Task 9 결과 요약 (2026-08-10 세션)

- 커밋: `ea37073` (`feat: add account withdrawal (soft delete)`) — 수정 루프 없이 클린 승인.
- `DELETE /api/account/me` 구현. 브리핑 명시대로 **이번 태스크는 계정 상태(`WITHDRAWN`)만 처리** — 소유 Passport 연쇄 삭제, JWT 토큰 즉시 무효화는 스코프 밖(전자는 Task 16, 후자는 애초에 계획에 없음)이며 리뷰어도 이걸 결함으로 잡지 않음.
- 인증은 Task 7과 동일한 `CurrentAccount.id(authentication)` 패턴(서버가 검증한 JWT subject만 사용, 클라이언트가 ID를 못 보냄) 그대로 재사용 확인.
- **⚠️ 반복 확인된 이슈 (Task 7 → Task 8 → 이번이 3번째):** `AccountService.getActiveAccountOrThrow`가 `Account::isActive`를 여전히 필터링하지 않음. 리뷰어가 이번엔 실제로 검증까지 했음 — `withdraw()`도 이 메서드를 거치기 때문에, **이미 탈퇴한 계정도 유효한 JWT만 있으면 `DELETE /api/account/me`를 몇 번이고 다시 호출할 수 있고(에러 없이 204, `withdrawnAt`만 최신 시각으로 계속 갱신됨)**, 같은 이유로 `getMe`/`updateProfile`/`confirmPasswordReset`도 여전히 탈퇴 계정에 대해 동작 가능한 상태로 남아있음.
  - 이번 태스크의 결함은 아님(브리핑 Step 3가 `getActiveAccountOrThrow`를 그대로 호출하라고 명시했고 구현자는 그대로 따름) — **근본 원인은 공용 메서드 자체**이고, 현재 30개 태스크 계획 안에 이 메서드를 중앙에서 고치는 태스크가 없음.
  - **원장에 "final whole-branch review 전에 사람에게 올릴 것"으로 기록해둠.** 후보 수정안: `getActiveAccountOrThrow`에 `.filter(Account::isActive)` 추가(이미 `login()`이 쓰는 패턴과 동일) — 호출부 4곳(`getMe`, `updateProfile`, `confirmPasswordReset`, `withdraw`)에 한 번에 적용됨.
- 리뷰 결과: **Spec Compliant, Task quality: Approved, 수정 없음.** Minor 1건(원장에 기록, deferred): `DELETE /api/account/me`에 대한 통합 테스트 없음(브리핑이 유닛 테스트만 요구).

## 그 사이 나온 의사결정: 앱 vs 웹

사용자가 멘토링에서 "앱으로 하는 게 좋아 보인다"는 피드백을 받았다고 해서 논의함. 결론: **백엔드는 수정 불필요.** 이미 클라이언트 종류를 안 타는 방식으로 설계돼 있음:
- 인증이 쿠키/세션이 아니라 `Authorization: Bearer` JWT (stateless) — 웹이든 앱이든 동일
- 이미지 업로드가 클라이언트→백엔드 멀티파트 업로드 후 백엔드가 Cloudinary에 올리는 방식 — 브라우저 전용 트릭 없음
- 비밀번호 재설정이 "이메일로 웹 링크 발송"이 아니라 토큰 발급(현재는 로그 스텁) + 클라이언트가 JSON으로 토큰 제출하는 방식 — 딥링크/웹뷰 불필요
- (브리핑 문서에 명시된 "네이티브 앱/PWA 아님, React 반응형 웹"이라는 프론트엔드 결정 자체는 유지됨. 프론트가 나중에 앱으로 바뀌어도 백엔드 API 계약은 그대로 재사용 가능하다는 의미.)

**유일하게 로드맵으로 남겨둔 것**: "타이밍 알림"을 앱 푸시(FCM 등)로 보내려면 지금 설계(GET 폴링 조회)엔 없는 별도 태스크가 필요함. 지금 30개 태스크 계획엔 포함 안 돼 있고, 원할 때 추가하면 됨.

## 재개 방법 (다음 세션에서 여기서부터)

**워크트리는 만들었다가 지웠습니다.** 메인(`C:\Users\dnflt\Desktop\jjy\workspace\MCM_Passport`, 브랜치 `main`)에서 워크트리 없이 바로 SDD를 진행하기로 이미 합의했음 — 다음 세션에서 재차 물어볼 필요 없음.

**Docker Desktop은 이미 켜져 있고 정상 작동 확인됨** (Task 2에서 testcontainers 1.21.4로 업그레이드 후 확인). 다음 세션 시작 시 꺼져 있으면 다시 켤 것 (`C:\Program Files\Docker\Docker\Docker Desktop.exe`).

**Task 16까지 2026-08-10 세션에서 완료됨 (커밋 `61aa50d..bfdfdf2`).** "4-2 여권 등록" 그룹(Task 10~16) 전체 완료. 아래는 그 다음부터 할 일.

**다음 세션에서 할 일 (순서대로):**

1. **superpowers:subagent-driven-development 스킬을 호출**하고, `docs/superpowers/plans/2026-08-05-mcm-nomad-passport-backend.md`의 **Task 17부터** 실행 요청 (Task 1~16은 완료·리뷰통과 확정 상태 — 커밋 `61aa50d..bfdfdf2`). Task 17부터는 "4-3 마모 진단" 그룹(Diagnosis 엔티티 → 규칙기반 진단엔진 → 진단 등록/조회 → 여권 목록에 진단정보 반영).
2. `scripts/sdd-workspace`로 워크스페이스 경로 확인(`.superpowers/sdd/2026-08-05-mcm-nomad-passport-backend/`) → `progress.md` 원장을 읽고 현재 상태 확인 → 이어서 구현 서브에이전트 디스패치 + 리뷰 루프.
3. **태스크 하나가 끝날 때마다(원장에 `Task N: complete` 기록하는 시점마다) 이 파일도 함께 갱신할 것** — 사용자가 명시적으로 요청한 습관. 아래 형식으로 "Task N 결과 요약" 섹션 추가: 커밋 해시, 브리핑과의 편차(있다면 이유), 리뷰 결과(Approved/수정 라운드 여부), Minor로 남긴 항목.
4. **⚠️ 사람에게 확인 필요한 누적 이슈 (final whole-branch review 전에 결정할 것):** `AccountService.getActiveAccountOrThrow`가 `Account::isActive`를 필터링하지 않는 문제가 Task 7 → 8 → 9에서 세 번 연속 발견됨(각각 프로필 조회/수정, 비밀번호 재설정, 회원탈퇴 재호출에 영향). 현재 30개 태스크 계획 안에 이 메서드를 중앙에서 고치는 태스크가 없음 — final review 때 사람 판단 필요(제안: `login()`이 이미 쓰는 `.filter(Account::isActive)` 패턴을 이 메서드에도 추가, 호출부 4곳에 한번에 적용).
5. (선택) 원본 참고자료(브리핑 md, 기획서 docx)도 저장소에 커밋할지 결정.

**진행 배경(참고용, 재확인 불필요):**
- Task 2에서 Docker Engine 29 / testcontainers 1.20.1 비호환 문제 발견 → 인간 승인 받고 1.21.4로 업그레이드(BOM 오버라이드 필요, `build.gradle`에 `ext['testcontainers.version'] = '1.21.4'`). 이후 태스크는 전부 이 버전 기준으로 진행.
- Task 3에서 구현자가 브리핑의 verbatim 테스트 접근(`@WebMvcTest`)을 임의로 다른 방식(`standaloneSetup()`)으로 바꿔서 리뷰에서 반려된 사례 있음 → 이후 태스크 디스패치 시 "장애물을 만나면 이미 확립된 정석 패턴을 쓰고 구조를 임의로 바꾸지 말 것"이라는 지침을 계속 포함 중.
- Task 1 리뷰에서 남긴 Minor("Task 6에서 SecurityConfig 생기면 `/api/health` 무인증 200 통합테스트 추가")가 Task 6 브리핑에 누락돼서 리뷰에서 Important로 걸린 적 있음 — **원장에 deferred로 남긴 항목은 반드시 해당 태스크 디스패치 시 지시문에 명시적으로 포함시킬 것.**
