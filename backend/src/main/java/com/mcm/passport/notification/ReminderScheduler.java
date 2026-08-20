package com.mcm.passport.notification;

import lombok.RequiredArgsConstructor;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ReminderScheduler {

    private final NotificationService notificationService;

    @Scheduled(cron = "0 0 9 * * *")
    @SchedulerLock(name = "generateReminders", lockAtLeastFor = "PT1M", lockAtMostFor = "PT10M")
    public void runDailyReminderCheck() {
        notificationService.generateReminders();
    }
}
