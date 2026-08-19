# MCM Nomad Passport 백엔드 — Final Whole-Branch Review 결과

원본 30개 태스크 계획(Task 1-30) + 승계(Transfer) 도메인 태스크(31-34)가 전부 완료된 뒤(`.superpowers/sdd/2026-08-05-mcm-nomad-passport-backend/progress.md` 참고), `/code-review high` 스킬로 전체 브랜치(`054da5b..HEAD`)를 반복적으로 리뷰하고 고치는 "final whole-branch review" 사이클을 진행했다. 이 문서는 그 사이클의 결과를 정리한 것이다.

**진행 방식**: 리뷰 실행 → 발견된 항목 전부 수정 → 다시 리뷰 실행, 이걸 반복. 총 7회 리뷰 패스, 커밋 20개.

**세션 종료 시점 (2026-08-12)**: 7차 리뷰까지 완료, 6차까지의 수정사항은 전부 검증 통과. 7차에서 나온 2건은 아래 "미해결 항목"에 정리 — 다음 세션에서 사람 판단 필요.

---

## 커밋 목록 (시간순)

| 커밋 | 요약 |
|---|---|
| `fa32524` | CareRecordController/TimelineController `@RequestPart`에 `@Valid` 누락 → dead validation 수정 |
| `9562968` | Diagnosis/Care/Timeline/Notification 서비스 + 비밀번호 재설정에 탈퇴 계정 거부 로직 추가 |
| `4dae034` | TransferService에 탈퇴 계정 거부 + redeem() 이중사용 경합 방지(락) |
| `4471779` | PassportService에 탈퇴 계정 거부 + 페이지네이션 정렬 안정화 + 진단 조회 N+1 배치화 |
| `c700259` | signup() 동시가입 경합 → 409 처리 + 탈퇴 계정 비밀번호 재설정 토큰 발급 안 하도록 |
| `2583234` | issueCode() 잔여 경합 수정 + TransferCode.redeem()에 Clock 주입 |
| `eb483eb` | Cloudinary 업로드 응답에 secure_url 없을 때 null 대신 예외 |
| `fc221cf` | DiagnosisService.submit()의 중복 소유권 체크 로직 제거(리팩터링) |
| `56bbbdb` | **issueCode/redeem 잠금 순서 반전으로 인한 교착상태(deadlock) 수정** — 이전 커밋(4dae034, 2583234)이 만든 버그 |
| `d7c6358` | PassportController PATCH 엔드포인트에 `@Valid` 누락 수정 |
| `0a47915` | 5개 서비스에 중복돼 있던 소유권 체크 로직을 `PassportOwnershipGuard`로 추출(리팩터링) |
| `60bc525` | 타입 불일치/멀티파트 파트 누락 → 400 (기존엔 500) |
| `2cb7d38` | 죽은 코드 `PassportSummaryResponse.withoutDiagnosis()` 제거 |
| `4dab0b9` | 잘못된 JSON/enum 값 → 400 (기존엔 500) |
| `90bdfce` | **비밀번호 재설정 토큰 동시 재사용 경합 수정** (락 도입) |
| `9a6d000` | PassportSummaryResponse에 Clock 주입(일관성) |
| `f7efc4c` | 필수 요청 파라미터 누락 → 400 (기존엔 500) |
| `a21f52b` | **withdraw()가 동시에 승계된 여권을 조용히 삭제하던 버그 수정** (Hibernate 1차 캐시 문제, redeem() 때와 동일 계열) + 비밀번호 재설정 시각에 Clock 주입 |
| `3908afa` | transfer preview()에 탈퇴 계정 거부 추가 + issueCode()가 PassportOwnershipGuard 재사용하도록 정리 |
| `847e337` | NotificationService.generateReminders() N+1 쿼리 배치화 |

**굵게 표시한 3건**은 이 세션 자체 수정이 만들어낸 진짜 버그(교착상태 1건, 경합상태 2건)였고, 전부 다음 리뷰 패스에서 잡혀서 그 자리에서 수정됐다. 특히 두 번의 "Hibernate 1차 캐시가 잠금 이후에도 오래된 값을 돌려주는" 버그(`TransferService.redeem()`, `AccountService.withdraw()`)는 패턴이 완전히 동일했다 — 엔티티를 잠금 없이 먼저 로드해버리면, 그 다음에 같은 id로 잠금 조회를 해도 영속성 컨텍스트가 캐시된(오래된) 인스턴스를 그대로 돌려준다. **앞으로 이 코드베이스에 락을 새로 추가할 때는, 그 트랜잭션에서 해당 엔티티를 잠금 없이 먼저 읽는 경로가 없는지 반드시 확인할 것.** 필요하면 스칼라 프로젝션(id만 가져오기)으로 우회.

---

## 미해결 항목 (다음 세션에서 결정 필요)

### 1. `withdraw()`와 동시 `register()` 사이의 좁은 경합 (7차 리뷰에서 발견, 미수정)

**증상**: `AccountService.withdraw()`가 소유 여권 id 목록을 스냅샷(`findIdsByOwnerAccountId`)한 직후, 커밋 전에 같은 계정으로 `PassportService.register()`가 동시에 호출되면(둘 다 `getActiveAccountOrThrow`가 잠금 없는 조회라 가능), 새로 등록된 여권은 그 스냅샷에 없어서 삭제 대상에서 빠진다.

**결과**: "탈퇴한 계정이 소유한 ACTIVE 여권"이 영구히 남는다. 모든 엔드포인트가 `getActiveAccountOrThrow`로 탈퇴 계정을 거부하므로 그 누구도 이 여권에 접근할 수 없지만, `NotificationService.generateReminders()`의 `findAllByStatus(ACTIVE)` 스캔에는 매일 계속 걸려서 아무도 못 보는 유령 알림(SELF_CARE/MILESTONE)을 영구히 계속 만들어낸다.

**왜 미수정 상태로 남겼는지**: 제대로 막으려면 `Account` 행 자체를 잠그고, `register()`를 포함해 계정 활성 상태를 확인하는 모든 지점(현재 6개 서비스 전부가 거치는 `AccountService.getActiveAccountOrThrow`)이 그 잠금을 인지하도록 바꿔야 한다 — 지금까지 고친 것들(특정 리소스 하나를 잠그는 국소적 수정)보다 훨씬 넓은 범위의 아키텍처 변경. 실제 피해는 타이밍이 정확히 맞아떨어져야 하는 좁은 경합이고 결과도 "접근 불가능한 유령 데이터 + 안 읽히는 알림" 정도로 낮다.

**후보 해결 방향** (다음 세션에서 사람 판단):
- (a) `withdraw()`가 `Account` 행에 `PESSIMISTIC_WRITE` 락을 걸고, `getActiveAccountOrThrow`도 필요한 호출부(최소한 `register()`)에서 같은 락을 걸도록 확장.
- (b) 더 가벼운 절충안: `withdraw()` 커밋 직후 한 번 더 같은 계정으로 등록된 여권이 있는지 재확인(2차 정리). 완벽하지 않지만 창을 훨씬 좁힘.
- (c) 그냥 두기: 발생 확률과 실질 피해가 낮다고 보고 알려진 이슈로만 기록.

### 2. `TransferService.generateCode()` 충돌 시 처리 없음 (2차 리뷰에서 발견 → deferred 확정, 7차에서 재확인)

이미 이 프로젝트 원장(SDD progress.md, Task 32)에서 한 번 검토하고 "36^6(≈21.8억) 키스페이스가 MVP 규모를 훨씬 초과해서 지금 고칠 가치 없음"으로 결론 낸 것과 동일한 패턴. 7차 리뷰가 다시 지적했지만(리뷰 에이전트가 과거 결정을 몰라서), 재론하지 않고 deferred 유지하기로 함. **다음에 이 항목이 또 나오면 재검토 없이 이 문서를 참고해서 넘어갈 것.**

### 3. 마일스톤 알림(100/365/1000일)에 catch-up 로직 없음 (4차 리뷰에서 발견, 제품 판단 필요)

스케줄러가 정확히 그 날짜에 안 돌면(배포 중 다운타임 등) 그 마일스톤은 영구히 스킵된다. 버그라기보다 "놓친 마일스톤을 나중에라도 보여줄지" 제품 결정 사항이라 보류.

### 4. `Notification.createdAt`이 `@PrePersist`에서 주입된 Clock 대신 실제 시계 사용 (4차 리뷰에서 발견, 의도적 보류)

이 코드베이스의 모든 엔티티(`Passport`, `TransferCode`, `Diagnosis` 등)가 `@PrePersist`에서 동일하게 실제 시계를 쓴다 — 이번 세션 수정이 깨뜨린 게 아니라 애초부터의 설계 관행. 고치려면 엔티티 생성 방식 전반(현재 `@PrePersist` 콜백 → 생성자에서 타임스탬프를 명시적으로 받는 방식)을 바꿔야 해서 범위가 크다고 보고 보류.

---

## 재개 방법

1. 위 "미해결 항목 1번"(withdraw/register 경주)을 사람이 검토하고 방향(a/b/c) 결정.
2. 결정 나면 구현 → 테스트(가능하면 실제 Testcontainers 동시성 테스트로 검증, 이 문서 위쪽 커밋들이 전부 그 패턴을 따름) → 커밋.
3. 원한다면 8차 리뷰(`/code-review high 054da5b..HEAD`)를 한 번 더 돌려서 수렴 확인. 6~7차 결과를 보면 새로 나오는 항목 수가 계속 줄고 있어(7 → 3 → 4 → 6 → 2), 수렴에 가까워진 것으로 보임.
