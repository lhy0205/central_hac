package com.mcm.passport.notification;

import com.mcm.passport.account.Account;
import com.mcm.passport.account.AccountRepository;
import com.mcm.passport.common.exception.ApiException;
import com.mcm.passport.common.exception.ErrorCode;
import com.mcm.passport.diagnosis.Diagnosis;
import com.mcm.passport.diagnosis.DiagnosisRepository;
import com.mcm.passport.diagnosis.OverallGrade;
import com.mcm.passport.notification.dto.NotificationResponse;
import com.mcm.passport.passport.Passport;
import com.mcm.passport.passport.PassportOwnershipGuard;
import com.mcm.passport.passport.PassportRepository;
import com.mcm.passport.passport.PassportStatus;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@Transactional
public class NotificationService {

    private static final List<Integer> MILESTONE_DAYS = List.of(100, 365, 1000);

    private final NotificationRepository notificationRepository;
    private final PassportRepository passportRepository;
    private final DiagnosisRepository diagnosisRepository;
    private final PassportOwnershipGuard passportOwnershipGuard;
    private final AccountRepository accountRepository;
    private final Clock clock;
    private final int reminderThresholdDays;
    private final int reminderCooldownDays;
    private final int repurchaseOwnershipDays;
    private final int repurchaseConsecutiveUrgent;

    public NotificationService(
            NotificationRepository notificationRepository,
            PassportRepository passportRepository,
            DiagnosisRepository diagnosisRepository,
            PassportOwnershipGuard passportOwnershipGuard,
            AccountRepository accountRepository,
            Clock clock,
            @Value("${notification.reminder-threshold-days}")
            int reminderThresholdDays,
            @Value("${notification.reminder-cooldown-days}")
            int reminderCooldownDays,
            @Value("${notification.repurchase-ownership-days}")
            int repurchaseOwnershipDays,
            @Value("${notification.repurchase-consecutive-urgent}")
            int repurchaseConsecutiveUrgent) {
        this.notificationRepository = notificationRepository;
        this.passportRepository = passportRepository;
        this.diagnosisRepository = diagnosisRepository;
        this.passportOwnershipGuard = passportOwnershipGuard;
        this.accountRepository = accountRepository;
        this.clock = clock;
        this.reminderThresholdDays = reminderThresholdDays;
        this.reminderCooldownDays = reminderCooldownDays;
        this.repurchaseOwnershipDays = repurchaseOwnershipDays;
        this.repurchaseConsecutiveUrgent = repurchaseConsecutiveUrgent;
    }

    public void evaluateAfterDiagnosis(Passport passport, Diagnosis diagnosis) {
        if (!isCareAlertsEnabled(passport)) return;
        Map<String, Object> reasonFactors = buildReasonFactors(passport, diagnosis);
        Integer overallScore = averageScore(diagnosis);
        switch (diagnosis.getOverallGrade()) {
            case C -> create(passport.getId(), NotificationType.SELF_CARE, reasonFactors,
                "마모가 진행되고 있어요. 셀프케어 가이드를 확인해보세요.", overallScore);
            case D -> create(passport.getId(), NotificationType.STORE_SERVICE, reasonFactors,
                "상태가 심각해요. 공식 서비스 예약을 고려해보세요.", overallScore);
            // S/A/B는 예전 GOOD에 해당하는 구간이라 알림을 만들지 않는다.
            case S, A, B -> {
            }
        }
        evaluateRepurchase(passport, diagnosis, reasonFactors, overallScore);
    }

    // 재구매 제안(FR-NOT-03/06). Care-First 원칙에 따라 "장기 소유 AND D등급 반복" 둘 다
    // 만족할 때만 만든다 — 오래 썼다는 이유만으로 권하면 케어 우선이라는 원칙과 어긋난다.
    private void evaluateRepurchase(Passport passport, Diagnosis diagnosis,
                                     Map<String, Object> reasonFactors, Integer overallScore) {
        if (diagnosis.getOverallGrade() != OverallGrade.D) return;

        long ownershipDays = passport.ownershipDays(LocalDate.now(clock));
        if (ownershipDays < repurchaseOwnershipDays) return;
        if (countTrailingUrgentDiagnoses(passport.getId()) < repurchaseConsecutiveUrgent) return;

        // 조건을 만족하는 동안은 진단할 때마다 계속 뜨게 되므로, 다른 알림과 같은 쿨다운을 건다.
        LocalDateTime cooldownStart = LocalDateTime.now(clock).minusDays(reminderCooldownDays);
        if (notificationRepository.existsByPassportIdAndTypeAndCreatedAtAfter(
                passport.getId(), NotificationType.REPURCHASE, cooldownStart)) {
            return;
        }

        Map<String, Object> factors = new LinkedHashMap<>(reasonFactors);
        factors.put("연속긴급진단", repurchaseConsecutiveUrgent);
        create(passport.getId(), NotificationType.REPURCHASE, factors,
            "오래 함께한 제품의 긴급 상태가 반복되고 있어요. 수선과 함께 새 제품도 살펴보시겠어요?",
            overallScore);
    }

    /** 최신 진단부터 거슬러 올라가며 연속으로 D등급인 횟수를 센다(D가 아닌 진단을 만나면 멈춤). */
    private int countTrailingUrgentDiagnoses(Long passportId) {
        List<Diagnosis> recent = diagnosisRepository
            .findAllByPassportIdOrderByDiagnosedAtDescIdDesc(
                passportId, PageRequest.of(0, repurchaseConsecutiveUrgent))
            .getContent();
        int count = 0;
        for (Diagnosis d : recent) {
            if (d.getOverallGrade() != OverallGrade.D) break;
            count++;
        }
        return count;
    }

    // journeyAlertsEnabled/marketingAlertsEnabled는 대응하는 알림 타입이 없어 게이팅하지 않는다.
    private boolean isCareAlertsEnabled(Passport passport) {
        return accountRepository.findById(passport.getOwnerAccountId())
            .map(Account::isCareAlertsEnabled)
            .orElse(true);
    }

    private Integer averageScore(Diagnosis diagnosis) {
        return (int) Math.round(diagnosis.getItemScores().values().stream()
            .mapToInt(Integer::intValue).average().orElse(0));
    }

    public void generateReminders() {
        LocalDateTime now = LocalDateTime.now(clock);
        List<Passport> activePassports = passportRepository.findAllByStatus(PassportStatus.ACTIVE);
        List<Long> passportIds = activePassports.stream().map(Passport::getId).toList();

        Map<Long, Diagnosis> latestDiagnosisByPassportId = diagnosisRepository.findLatestByPassportIdIn(passportIds);

        // 루프 안에서 계정을 한 건씩 조회하면 N+1이 되므로 한 번에 배치 조회해 맵으로 만든다.
        List<Long> ownerAccountIds = activePassports.stream().map(Passport::getOwnerAccountId).distinct().toList();
        Map<Long, Boolean> careAlertsEnabledByAccountId = ownerAccountIds.isEmpty()
            ? Map.of()
            : accountRepository.findAllById(ownerAccountIds).stream()
                .collect(Collectors.toMap(Account::getId, Account::isCareAlertsEnabled));

        LocalDateTime cooldownStart = now.minusDays(reminderCooldownDays);
        Set<Long> recentlyRemindedPassportIds = passportIds.isEmpty()
            ? Set.of()
            : new HashSet<>(notificationRepository.findPassportIdsByTypeAndCreatedAtAfter(
                NotificationType.SELF_CARE, cooldownStart));
        // 알려진 한계: ShedLock lockAtMostFor(10분)가 만료돼 배치가 겹쳐 돌면 서로의 커밋 전 insert가
        // 안 보여 SELF_CARE가 중복 생성될 수 있다. 30일 슬라이딩 윈도우라 유니크 제약으로는 못 막고, 계정 잠금은 과해서 안 건다.

        // 스케줄러가 하루 걸러도 마일스톤을 놓치지 않도록 보낸 마일스톤 "값"을 집합으로 모아
        // 지나친 것 중 미발송분만 따라잡는다. 개수만 세면 중복 발송 한 번에 이후 마일스톤이 영구히 스킵된다.
        Map<Long, Set<Integer>> milestoneDaysSentByPassportId = new HashMap<>();
        if (!passportIds.isEmpty()) {
            for (Notification n : notificationRepository.findAllByPassportIdInAndType(passportIds, NotificationType.MILESTONE)) {
                Object sentMilestoneDays = n.getReasonFactors().get("소유일수");
                if (sentMilestoneDays instanceof Number number) {
                    milestoneDaysSentByPassportId
                        .computeIfAbsent(n.getPassportId(), k -> new HashSet<>())
                        .add(number.intValue());
                }
            }
        }

        // 스냅샷 이후 삭제된 여권에 알림이 생기지 않도록 생성 직전에 한 번 더 확인한다. 배치가
        // 도는 내내 전부 잠그는 건 과해서 창을 좁히는 선에서 그친다.
        Set<Long> stillActivePassportIds = passportIds.isEmpty()
            ? Set.of()
            : new HashSet<>(passportRepository.findIdsByStatus(PassportStatus.ACTIVE));

        for (Passport passport : activePassports) {
            if (!stillActivePassportIds.contains(passport.getId())) continue;
            if (!careAlertsEnabledByAccountId.getOrDefault(passport.getOwnerAccountId(), true)) continue;
            Diagnosis latestDiagnosis = latestDiagnosisByPassportId.get(passport.getId());
            LocalDate lastActivity = latestDiagnosis != null
                ? latestDiagnosis.getDiagnosedAt().toLocalDate()
                : passport.getPurchaseDate();
            long daysSince = ChronoUnit.DAYS.between(lastActivity, now.toLocalDate());
            if (daysSince > reminderThresholdDays && !recentlyRemindedPassportIds.contains(passport.getId())) {
                create(passport.getId(), NotificationType.SELF_CARE,
                    Map.of("최근활동경과일", daysSince), "재진단할 시기가 지났어요. 마모 상태를 다시 확인해보세요.", null);
            }
            long ownershipDaysSincePurchase = passport.ownershipDays(now.toLocalDate());
            Set<Integer> milestoneDaysSent =
                milestoneDaysSentByPassportId.getOrDefault(passport.getId(), Set.of());
            for (int milestone : MILESTONE_DAYS) {
                if (ownershipDaysSincePurchase >= milestone && !milestoneDaysSent.contains(milestone)) {
                    create(passport.getId(), NotificationType.MILESTONE,
                        Map.of("소유일수", milestone), milestone + "일째 함께하고 있어요!", null);
                }
            }
        }
    }

    public Page<NotificationResponse> list(Long passportId, Long requesterAccountId, Pageable pageable) {
        assertOwnership(passportId, requesterAccountId);
        // generateReminders()가 한 트랜잭션에서 만든 알림들은 Postgres now()가 트랜잭션당 고정이라
        // created_at이 정확히 같을 수 있다. Reservation/CareRecord/Passport.list()와 같은 방식으로 id를 타이브레이커로 덧붙인다.
        Pageable stablePageable = PageRequest.of(
            pageable.getPageNumber(), pageable.getPageSize(),
            pageable.getSort().and(Sort.by(Sort.Direction.ASC, "id")));
        return notificationRepository.findAllByPassportIdOrderByCreatedAtDesc(passportId, stablePageable)
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
        passportOwnershipGuard.getOwnedActivePassport(passportId, requesterAccountId);
    }

    private Map<String, Object> buildReasonFactors(Passport passport, Diagnosis diagnosis) {
        long ownershipDays = passport.ownershipDays(LocalDate.now(clock));
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
