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
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

// @Transactional이 없으면 markRead/markDismiss가 findById로 가져온 엔티티를 바꿔도 명시적
// save() 호출이 없어 DB에 반영 안 될 수 있다. 트랜잭션 의미론은 Mockito로는 검증이 안 되니
// 실제 DB(Testcontainers)로 확인.
class NotificationServiceIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private NotificationService notificationService;
    @Autowired
    private NotificationRepository notificationRepository;
    @Autowired
    private PassportRepository passportRepository;
    @Autowired
    private AccountRepository accountRepository;

    @Test
    void markReadPersistsChangeToDatabase() {
        Account owner = accountRepository.save(new Account("notif-owner@example.com", "hash", "닉네임"));
        Passport passport = passportRepository.save(new Passport("A1234", 2024, owner.getId(), "Nomad Backpack",
            "애칭", LocalDate.of(2024, 1, 15), "MCM 강남점", null, false, List.of(), UsageFrequency.OCCASIONAL));
        Notification notification = notificationRepository.save(new Notification(passport.getId(),
            NotificationType.SELF_CARE, Map.of("사용빈도", "DAILY"), "메시지", 62));

        notificationService.markRead(notification.getId(), owner.getId());

        Notification reloaded = notificationRepository.findById(notification.getId()).orElseThrow();
        assertThat(reloaded.isRead()).isTrue();
    }

    @Test
    void markDismissPersistsChangeToDatabase() {
        Account owner = accountRepository.save(new Account("notif-owner-2@example.com", "hash", "닉네임"));
        Passport passport = passportRepository.save(new Passport("A5678", 2024, owner.getId(), "Nomad Backpack",
            "애칭", LocalDate.of(2024, 1, 15), "MCM 강남점", null, false, List.of(), UsageFrequency.OCCASIONAL));
        Notification notification = notificationRepository.save(new Notification(passport.getId(),
            NotificationType.STORE_SERVICE, Map.of("사용빈도", "DAILY"), "메시지", 85));

        notificationService.markDismiss(notification.getId(), owner.getId());

        Notification reloaded = notificationRepository.findById(notification.getId()).orElseThrow();
        assertThat(reloaded.isDismissed()).isTrue();
    }
}
