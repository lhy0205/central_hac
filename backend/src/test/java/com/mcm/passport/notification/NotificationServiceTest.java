package com.mcm.passport.notification;

import com.mcm.passport.diagnosis.Diagnosis;
import com.mcm.passport.diagnosis.DiagnosisType;
import com.mcm.passport.diagnosis.OverallGrade;
import com.mcm.passport.passport.Passport;
import com.mcm.passport.passport.PassportOwnershipGuard;
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
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class NotificationServiceTest {

    @Mock
    private NotificationRepository notificationRepository;

    @Mock
    private com.mcm.passport.passport.PassportRepository passportRepository;

    @Mock
    private com.mcm.passport.diagnosis.DiagnosisRepository diagnosisRepository;

    @Mock
    private PassportOwnershipGuard passportOwnershipGuard;

    @Mock
    private com.mcm.passport.account.AccountRepository accountRepository;

    private final Clock fixedClock = Clock.fixed(
        LocalDate.of(2026, 8, 5).atStartOfDay(ZoneId.systemDefault()).toInstant(), ZoneId.systemDefault());

    private NotificationService notificationService;

    @Test
    void goodGradeCreatesNoNotification() {
        notificationService = newService();
        Passport passport = passportWithPurchaseDate(LocalDate.of(2024, 1, 1));
        Diagnosis diagnosis = new Diagnosis(1L, DiagnosisType.SELF, List.of("https://cdn/1.jpg"),
            Map.of("마모", 20), OverallGrade.A, "근거");

        notificationService.evaluateAfterDiagnosis(passport, diagnosis);

        verify(notificationRepository, never()).save(any());
    }

    @Test
    void needsCareGradeCreatesSelfCareNotification() {
        notificationService = newService();
        Passport passport = passportWithPurchaseDate(LocalDate.of(2024, 1, 1));
        Diagnosis diagnosis = new Diagnosis(1L, DiagnosisType.SELF, List.of("https://cdn/1.jpg"),
            Map.of("마모", 50), OverallGrade.C, "근거");

        notificationService.evaluateAfterDiagnosis(passport, diagnosis);

        verify(notificationRepository).save(argThat(n -> n.getType() == NotificationType.SELF_CARE));
    }

    @Test
    void urgentGradeCreatesStoreServiceNotification() {
        notificationService = newService();
        Passport passport = passportWithPurchaseDate(LocalDate.of(2024, 1, 1));
        Diagnosis diagnosis = new Diagnosis(1L, DiagnosisType.SELF, List.of("https://cdn/1.jpg"),
            Map.of("마모", 80), OverallGrade.D, "근거");

        notificationService.evaluateAfterDiagnosis(passport, diagnosis);

        verify(notificationRepository).save(argThat(n -> n.getType() == NotificationType.STORE_SERVICE));
    }

    @Test
    void listAppendsIdAsStableSortTiebreaker() {
        // created_at이 같을 수 있어서 PassportService.list()처럼 id 타이브레이커를 붙였는지 확인
        notificationService = newService();
        when(passportOwnershipGuard.getOwnedActivePassport(1L, 1L)).thenReturn(mock(Passport.class));
        org.springframework.data.domain.Pageable requested = org.springframework.data.domain.PageRequest.of(0, 20);
        when(notificationRepository.findAllByPassportIdOrderByCreatedAtDesc(
                org.mockito.ArgumentMatchers.eq(1L), any(org.springframework.data.domain.Pageable.class)))
            .thenReturn(new org.springframework.data.domain.PageImpl<>(List.of()));

        notificationService.list(1L, 1L, requested);

        org.mockito.ArgumentCaptor<org.springframework.data.domain.Pageable> captor =
            org.mockito.ArgumentCaptor.forClass(org.springframework.data.domain.Pageable.class);
        verify(notificationRepository).findAllByPassportIdOrderByCreatedAtDesc(eq(1L), captor.capture());
        assertThat(captor.getValue().getSort().getOrderFor("id")).isNotNull();
        assertThat(captor.getValue().getSort().getOrderFor("id").getDirection())
            .isEqualTo(org.springframework.data.domain.Sort.Direction.ASC);
    }

    @Test
    void markReadRejectsNonOwner() {
        notificationService = newService();
        Notification notification = new Notification(1L, NotificationType.SELF_CARE,
            Map.of("사용빈도", "DAILY"), "메시지", 62);
        when(notificationRepository.findById(5L)).thenReturn(java.util.Optional.of(notification));
        when(passportOwnershipGuard.getOwnedActivePassport(1L, 999L))
            .thenThrow(new com.mcm.passport.common.exception.ApiException(
                com.mcm.passport.common.exception.ErrorCode.FORBIDDEN));

        assertThatThrownBy(() -> notificationService.markRead(5L, 999L))
            .isInstanceOf(com.mcm.passport.common.exception.ApiException.class)
            .extracting(e -> ((com.mcm.passport.common.exception.ApiException) e).getErrorCode())
            .isEqualTo(com.mcm.passport.common.exception.ErrorCode.FORBIDDEN);
    }

    @Test
    void markReadReturnsNotFoundWhenPassportSoftDeleted() {
        notificationService = newService();
        Notification notification = new Notification(1L, NotificationType.SELF_CARE,
            Map.of("사용빈도", "DAILY"), "메시지", 62);
        when(notificationRepository.findById(5L)).thenReturn(java.util.Optional.of(notification));
        when(passportOwnershipGuard.getOwnedActivePassport(1L, 1L))
            .thenThrow(new com.mcm.passport.common.exception.ApiException(
                com.mcm.passport.common.exception.ErrorCode.PASSPORT_NOT_FOUND));

        assertThatThrownBy(() -> notificationService.markRead(5L, 1L))
            .isInstanceOf(com.mcm.passport.common.exception.ApiException.class)
            .extracting(e -> ((com.mcm.passport.common.exception.ApiException) e).getErrorCode())
            .isEqualTo(com.mcm.passport.common.exception.ErrorCode.PASSPORT_NOT_FOUND);
    }

    @Test
    void markReadRejectsWithdrawnAccount() {
        notificationService = newService();
        Notification notification = new Notification(1L, NotificationType.SELF_CARE,
            Map.of("사용빈도", "DAILY"), "메시지", 62);
        when(notificationRepository.findById(5L)).thenReturn(java.util.Optional.of(notification));
        when(passportOwnershipGuard.getOwnedActivePassport(1L, 1L))
            .thenThrow(new com.mcm.passport.common.exception.ApiException(
                com.mcm.passport.common.exception.ErrorCode.ACCOUNT_NOT_FOUND));

        assertThatThrownBy(() -> notificationService.markRead(5L, 1L))
            .isInstanceOf(com.mcm.passport.common.exception.ApiException.class)
            .extracting(e -> ((com.mcm.passport.common.exception.ApiException) e).getErrorCode())
            .isEqualTo(com.mcm.passport.common.exception.ErrorCode.ACCOUNT_NOT_FOUND);
        verifyNoInteractions(passportRepository);
    }

    @Test
    void generateRemindersCreatesReminderWhenOverThreshold() {
        notificationService = newService();
        Passport passport = passportWithPurchaseDate(LocalDate.of(2024, 1, 1)); // 기준일로부터 900일 이상 경과
        when(passportRepository.findAllByStatus(com.mcm.passport.passport.PassportStatus.ACTIVE))
            .thenReturn(List.of(passport));
        // 알림 생성 직전 재확인 — passport.getId()가 null이라 "여전히 ACTIVE인 id 집합"에도
        // null을 넣어 이 여권이 필터링되지 않게 함
        when(passportRepository.findIdsByStatus(com.mcm.passport.passport.PassportStatus.ACTIVE))
            .thenReturn(java.util.Arrays.asList((Long) null));
        when(notificationRepository.findPassportIdsByTypeAndCreatedAtAfter(eq(NotificationType.SELF_CARE), any()))
            .thenReturn(List.of());

        notificationService.generateReminders();

        verify(notificationRepository).save(argThat(n -> n.getType() == NotificationType.SELF_CARE));
    }

    @Test
    void generateRemindersSkipsWhenAlreadyReminded() {
        notificationService = newService();
        Passport passport = passportWithPurchaseDate(LocalDate.of(2024, 1, 1));
        when(passportRepository.findAllByStatus(com.mcm.passport.passport.PassportStatus.ACTIVE))
            .thenReturn(List.of(passport));
        // 알림 생성 직전 재확인 — passport.getId()가 null이라 "여전히 ACTIVE인 id 집합"에도
        // null을 넣어 이 여권이 필터링되지 않게 함
        when(passportRepository.findIdsByStatus(com.mcm.passport.passport.PassportStatus.ACTIVE))
            .thenReturn(java.util.Arrays.asList((Long) null));
        // passport.getId()가 null이라 "이미 리마인드된 id 집합"에도 null을 넣어 포함된 상황을 만듦
        when(notificationRepository.findPassportIdsByTypeAndCreatedAtAfter(eq(NotificationType.SELF_CARE), any()))
            .thenReturn(java.util.Arrays.asList((Long) null));
        // 100일/365일 마일스톤은 이미 지났으니 둘 다 보낸 것으로 처리 — 이 테스트는 재진단
        // 리마인더 쿨다운만 봄
        when(notificationRepository.findAllByPassportIdInAndType(any(), eq(NotificationType.MILESTONE)))
            .thenReturn(List.of(
                new Notification(null, NotificationType.MILESTONE, Map.of("소유일수", 100), "100일째 함께하고 있어요!", null),
                new Notification(null, NotificationType.MILESTONE, Map.of("소유일수", 365), "365일째 함께하고 있어요!", null)));

        notificationService.generateReminders();

        verify(notificationRepository, never()).save(any());
    }

    @Test
    void generateRemindersCatchesUpAMissedMilestoneEvenWhenOwnershipDayIsNotExactlyOnIt() {
        // 스케줄러가 정확히 100일째를 놓쳐도(장애/재배포) 105일째처럼 그 마일스톤을 따라잡아 보내야 함
        notificationService = newService();
        Passport passport = passportWithPurchaseDate(LocalDate.of(2026, 8, 5).minusDays(105));
        when(passportRepository.findAllByStatus(com.mcm.passport.passport.PassportStatus.ACTIVE))
            .thenReturn(List.of(passport));
        // 알림 생성 직전 재확인 — passport.getId()가 null이라 "여전히 ACTIVE인 id 집합"에도
        // null을 넣어 이 여권이 필터링되지 않게 함
        when(passportRepository.findIdsByStatus(com.mcm.passport.passport.PassportStatus.ACTIVE))
            .thenReturn(java.util.Arrays.asList((Long) null));
        when(notificationRepository.findPassportIdsByTypeAndCreatedAtAfter(eq(NotificationType.SELF_CARE), any()))
            .thenReturn(List.of());
        when(notificationRepository.findAllByPassportIdInAndType(any(), eq(NotificationType.MILESTONE)))
            .thenReturn(List.of());

        notificationService.generateReminders();

        verify(notificationRepository).save(argThat(n ->
            n.getType() == NotificationType.MILESTONE && n.getMessage().startsWith("100일째")));
    }

    @Test
    void generateRemindersStillSendsLaterMilestoneWhenAnEarlierOneWasDuplicated() {
        // 100일 마일스톤이 중복 생성돼도(예: ShedLock lockAtMostFor 만료로 겹쳐 도는 경우)
        // "보낸 개수"가 아니라 값(소유일수)으로 비교해야 365일 마일스톤이 정상적으로 나감
        notificationService = newService();
        Passport passport = passportWithPurchaseDate(LocalDate.of(2026, 8, 5).minusDays(400)); // 100/365일 모두 경과
        when(passportRepository.findAllByStatus(com.mcm.passport.passport.PassportStatus.ACTIVE))
            .thenReturn(List.of(passport));
        when(passportRepository.findIdsByStatus(com.mcm.passport.passport.PassportStatus.ACTIVE))
            .thenReturn(java.util.Arrays.asList((Long) null));
        when(notificationRepository.findPassportIdsByTypeAndCreatedAtAfter(eq(NotificationType.SELF_CARE), any()))
            .thenReturn(List.of());
        // 100일 마일스톤만 중복 두 번 생성된 상황 — "개수" 기준이면 365일 마일스톤까지
        // 이미 보낸 것으로 잘못 취급됨
        when(notificationRepository.findAllByPassportIdInAndType(any(), eq(NotificationType.MILESTONE)))
            .thenReturn(List.of(
                new Notification(null, NotificationType.MILESTONE, Map.of("소유일수", 100), "100일째 함께하고 있어요!", null),
                new Notification(null, NotificationType.MILESTONE, Map.of("소유일수", 100), "100일째 함께하고 있어요!", null)));

        notificationService.generateReminders();

        verify(notificationRepository).save(argThat(n ->
            n.getType() == NotificationType.MILESTONE && n.getMessage().startsWith("365일째")));
        verify(notificationRepository, never()).save(argThat(n ->
            n.getType() == NotificationType.MILESTONE && n.getMessage().startsWith("100일째")));
    }

    @Test
    void generateRemindersSkipsPassportThatWasDeletedAfterTheInitialSnapshot() {
        // 스냅샷 이후 여권이 삭제되면 재확인 없이는 접근 불가능한 여권에도 알림이 생성됨
        notificationService = newService();
        Passport passport = passportWithPurchaseDate(LocalDate.of(2024, 1, 1)); // 900일 이상 경과 → 리마인더 대상
        when(passportRepository.findAllByStatus(com.mcm.passport.passport.PassportStatus.ACTIVE))
            .thenReturn(List.of(passport));
        // 스냅샷 이후 재확인 시점에는 이미 삭제되어 빈 집합으로 돌아온다.
        when(passportRepository.findIdsByStatus(com.mcm.passport.passport.PassportStatus.ACTIVE))
            .thenReturn(List.of());
        when(notificationRepository.findPassportIdsByTypeAndCreatedAtAfter(eq(NotificationType.SELF_CARE), any()))
            .thenReturn(List.of());

        notificationService.generateReminders();

        verify(notificationRepository, never()).save(any());
    }

    @Test
    void needsCareGradeSkipsNotificationWhenCareAlertsDisabled() {
        notificationService = newService();
        Passport passport = passportWithPurchaseDate(LocalDate.of(2024, 1, 1));
        com.mcm.passport.account.Account ownerAccount = accountWithCareAlertsDisabled();
        when(accountRepository.findById(1L)).thenReturn(java.util.Optional.of(ownerAccount));
        Diagnosis diagnosis = new Diagnosis(1L, DiagnosisType.SELF, List.of("https://cdn/1.jpg"),
            Map.of("마모", 50), OverallGrade.C, "근거");

        notificationService.evaluateAfterDiagnosis(passport, diagnosis);

        verify(notificationRepository, never()).save(any());
    }

    @Test
    void generateRemindersSkipsWhenCareAlertsDisabled() {
        notificationService = newService();
        Passport passport = passportWithPurchaseDate(LocalDate.of(2024, 1, 1));
        // findAllById로 배치 조회 후 Account::getId로 맵을 만드는데, Account는 protected 생성자뿐이라
        // id를 못 채우니 getId()/isCareAlertsEnabled()를 목으로 스텁
        com.mcm.passport.account.Account ownerAccount = mock(com.mcm.passport.account.Account.class);
        when(ownerAccount.getId()).thenReturn(1L);
        when(ownerAccount.isCareAlertsEnabled()).thenReturn(false);
        when(accountRepository.findAllById(List.of(1L))).thenReturn(List.of(ownerAccount));
        when(passportRepository.findAllByStatus(com.mcm.passport.passport.PassportStatus.ACTIVE))
            .thenReturn(List.of(passport));
        // 알림 생성 직전 재확인 — passport.getId()가 null이라 "여전히 ACTIVE인 id 집합"에도
        // null을 넣어 이 여권이 필터링되지 않게 함
        when(passportRepository.findIdsByStatus(com.mcm.passport.passport.PassportStatus.ACTIVE))
            .thenReturn(java.util.Arrays.asList((Long) null));

        notificationService.generateReminders();

        verify(notificationRepository, never()).save(any());
    }

    @Test
    void generateRemindersBatchLoadsCareAlertsPreferenceInsteadOfPerPassport() {
        // passport마다 findById를 따로 부르지 않고 findAllById로 한 번에 불러야 함
        notificationService = newService();
        Passport passport = passportWithPurchaseDate(LocalDate.of(2024, 1, 1));
        when(passportRepository.findAllByStatus(com.mcm.passport.passport.PassportStatus.ACTIVE))
            .thenReturn(List.of(passport));
        // 알림 생성 직전 재확인 — passport.getId()가 null이라 "여전히 ACTIVE인 id 집합"에도
        // null을 넣어 이 여권이 필터링되지 않게 함
        when(passportRepository.findIdsByStatus(com.mcm.passport.passport.PassportStatus.ACTIVE))
            .thenReturn(java.util.Arrays.asList((Long) null));
        when(notificationRepository.findPassportIdsByTypeAndCreatedAtAfter(eq(NotificationType.SELF_CARE), any()))
            .thenReturn(List.of());
        when(accountRepository.findAllById(any())).thenReturn(List.of());

        notificationService.generateReminders();

        verify(accountRepository).findAllById(any());
        verify(accountRepository, never()).findById(any());
    }

    private com.mcm.passport.account.Account accountWithCareAlertsDisabled() {
        com.mcm.passport.account.Account account = new com.mcm.passport.account.Account(
            "owner@example.com", "hash", "닉네임");
        account.updateNotificationPreferences(false, true, false);
        return account;
    }

    // --- FR-NOT-03 / FR-NOT-06: 재구매 제안 ---
    // Care-First 원칙상 "장기 소유 + 반복 D등급" 둘 다 맞을 때만 만들어야 함.
    // 하나만 맞아서 새는 케이스가 없는지 아래 세 테스트로 확인.

    @Test
    void longOwnershipWithRepeatedUrgentCreatesRepurchaseNotification() {
        notificationService = newService();
        // fixedClock이 2026-08-05이므로 구매일 2020-01-01은 소유 2408일(기본 임계 1095일 초과)
        Passport passport = passportWithPurchaseDate(LocalDate.of(2020, 1, 1));
        Diagnosis urgent = diagnosisWithGrade(OverallGrade.D);
        givenTrailingDiagnoses(urgent, diagnosisWithGrade(OverallGrade.D));

        notificationService.evaluateAfterDiagnosis(passport, urgent);

        verify(notificationRepository).save(argThat(n -> n.getType() == NotificationType.REPURCHASE));
    }

    @Test
    void repeatedUrgentOnRecentPurchaseDoesNotCreateRepurchaseNotification() {
        notificationService = newService();
        // 산 지 얼마 안 된 제품은 상태가 나빠도 케어로 안내해야 함(수선 우선).
        // 진단 이력을 stub 안 하는 건 의도적 — 소유기간에서 먼저 걸러져야 하므로 조회까지 가면 안 됨
        // (스텁 넣으면 Mockito가 미사용으로 잡아줌)
        Passport passport = passportWithPurchaseDate(LocalDate.of(2026, 1, 1));
        Diagnosis urgent = diagnosisWithGrade(OverallGrade.D);

        notificationService.evaluateAfterDiagnosis(passport, urgent);

        verify(notificationRepository, never()).save(argThat(n -> n.getType() == NotificationType.REPURCHASE));
    }

    @Test
    void firstUrgentOnLongOwnedProductDoesNotCreateRepurchaseNotification() {
        notificationService = newService();
        // 처음 D가 뜬 것만으로는 "수선 불가"로 볼 수 없다 — 반복되어야 한다.
        Passport passport = passportWithPurchaseDate(LocalDate.of(2020, 1, 1));
        Diagnosis urgent = diagnosisWithGrade(OverallGrade.D);
        givenTrailingDiagnoses(urgent, diagnosisWithGrade(OverallGrade.B));

        notificationService.evaluateAfterDiagnosis(passport, urgent);

        verify(notificationRepository, never()).save(argThat(n -> n.getType() == NotificationType.REPURCHASE));
    }

    @Test
    void repurchaseNotificationIsNotRepeatedWithinCooldown() {
        notificationService = newService();
        Passport passport = passportWithPurchaseDate(LocalDate.of(2020, 1, 1));
        Diagnosis urgent = diagnosisWithGrade(OverallGrade.D);
        givenTrailingDiagnoses(urgent, diagnosisWithGrade(OverallGrade.D));
        when(notificationRepository.existsByPassportIdAndTypeAndCreatedAtAfter(
            any(), eq(NotificationType.REPURCHASE), any())).thenReturn(true);

        notificationService.evaluateAfterDiagnosis(passport, urgent);

        verify(notificationRepository, never()).save(argThat(n -> n.getType() == NotificationType.REPURCHASE));
    }

    private NotificationService newService() {
        return new NotificationService(
            notificationRepository, passportRepository, diagnosisRepository, passportOwnershipGuard,
            accountRepository, fixedClock, 90, 30, 1095, 2);
    }

    private Diagnosis diagnosisWithGrade(OverallGrade grade) {
        return new Diagnosis(1L, DiagnosisType.SELF, List.of("https://cdn/1.jpg"),
            Map.of("마모", 80), grade, "근거");
    }

    /** 최신순으로 조회되는 직전 진단 목록을 흉내낸다(첫 번째가 방금 저장된 진단). */
    private void givenTrailingDiagnoses(Diagnosis... newestFirst) {
        when(diagnosisRepository.findAllByPassportIdOrderByDiagnosedAtDescIdDesc(any(), any()))
            .thenReturn(new org.springframework.data.domain.PageImpl<>(List.of(newestFirst)));
    }

    private Passport passportWithPurchaseDate(LocalDate purchaseDate) {
        return new Passport("A1234", purchaseDate.getYear(), 1L, "Nomad Backpack", "애칭",
            purchaseDate, "MCM 강남점", null, false, List.of(), UsageFrequency.DAILY);
    }
}
