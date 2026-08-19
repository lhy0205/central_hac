package com.mcm.passport.notification;

import com.mcm.passport.account.Account;
import com.mcm.passport.account.AccountRepository;
import com.mcm.passport.passport.Passport;
import com.mcm.passport.passport.PassportRepository;
import com.mcm.passport.passport.UsageFrequency;
import com.mcm.passport.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class NotificationRepositoryTest extends AbstractIntegrationTest {

    @Autowired
    private NotificationRepository notificationRepository;
    @Autowired
    private PassportRepository passportRepository;
    @Autowired
    private AccountRepository accountRepository;

    @Test
    void savesAndDetectsRecentReminder() {
        Account owner = accountRepository.save(new Account("a@example.com", "hash", "닉네임"));
        Passport passport = passportRepository.save(new Passport("A1234", 2024, owner.getId(), "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 15), "MCM 강남점", null, false, List.of(), UsageFrequency.OCCASIONAL));

        notificationRepository.save(new Notification(passport.getId(), NotificationType.SELF_CARE,
            Map.of("사용빈도", "DAILY"), "재진단할 시기가 지났어요.", 62));

        boolean exists = notificationRepository.existsByPassportIdAndTypeAndCreatedAtAfter(
            passport.getId(), NotificationType.SELF_CARE, LocalDateTime.now().minusDays(1));

        assertThat(exists).isTrue();
    }
}
