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

            case S, A, B -> {
            }
        }
        evaluateRepurchase(passport, diagnosis, reasonFactors, overallScore);
    }

    private void evaluateRepurchase(Passport passport, Diagnosis diagnosis,
                                     Map<String, Object> reasonFactors, Integer overallScore) {
        if (diagnosis.getOverallGrade() != OverallGrade.D) return;

        long ownershipDays = passport.ownershipDays(LocalDate.now(clock));
        if (ownershipDays < repurchaseOwnershipDays) return;
        if (countTrailingUrgentDiagnoses(passport.getId()) < repurchaseConsecutiveUrgent) return;

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
