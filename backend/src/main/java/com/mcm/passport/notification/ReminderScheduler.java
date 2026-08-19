package com.mcm.passport.notification;

import lombok.RequiredArgsConstructor;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ReminderScheduler {

    private final NotificationService notificationService;

    // 다중 인스턴스 배포나 수동 재트리거로 이 배치가 겹쳐 돌면, 두 실행 모두 "아직 안 보낸" 같은
    // 스냅샷을 보고 똑같이 알림을 만들어 중복이 생긴다 — ShedLock으로 한 번에 한 인스턴스만 실행되게
    // 막는다. lockAtLeastFor는 실행이 아주 짧게 끝나더라도 다른 인스턴스가 바로 이어서 재시도하지
    // 않도록 최소 보유 시간을 둔다.
    @Scheduled(cron = "0 0 9 * * *")
    @SchedulerLock(name = "generateReminders", lockAtLeastFor = "PT1M", lockAtMostFor = "PT10M")
    public void runDailyReminderCheck() {
        notificationService.generateReminders();
    }
}
