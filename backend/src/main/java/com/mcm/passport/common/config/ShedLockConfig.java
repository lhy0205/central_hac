package com.mcm.passport.common.config;

import net.javacrumbs.shedlock.core.LockProvider;
import net.javacrumbs.shedlock.provider.jdbctemplate.JdbcTemplateLockProvider;
import net.javacrumbs.shedlock.spring.annotation.EnableSchedulerLock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.sql.DataSource;

// ReminderScheduler처럼 @Scheduled로 도는 배치가 다중 인스턴스 배포나 수동 재트리거로 겹쳐 실행되면
// 같은 알림이 중복 생성될 수 있다 — DB 행 잠금 기반의 분산 락으로 한 번에 한 인스턴스만 실행되게 막는다.
@Configuration
@EnableSchedulerLock(defaultLockAtMostFor = "PT10M")
public class ShedLockConfig {

    @Bean
    public LockProvider lockProvider(DataSource dataSource) {
        return new JdbcTemplateLockProvider(dataSource);
    }
}
