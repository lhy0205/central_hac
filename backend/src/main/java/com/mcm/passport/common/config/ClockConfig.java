package com.mcm.passport.common.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.auditing.DateTimeProvider;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Optional;

// dateTimeProviderRef로 @CreatedDate가 시스템 시계 대신 이 앱의 Clock 빈을 타도록 한다.
// 엔티티는 생성자로 Clock을 주입받을 수 없어서 JPA auditing으로 우회하는 것.
@Configuration
@EnableJpaAuditing(dateTimeProviderRef = "auditingDateTimeProvider")
public class ClockConfig {

    @Bean
    public Clock clock() {
        return Clock.systemDefaultZone();
    }

    @Bean
    public DateTimeProvider auditingDateTimeProvider(Clock clock) {
        return () -> Optional.of(LocalDateTime.now(clock));
    }

    // @PastOrPresent/@FutureOrPresent는 기본적으로 자체 ClockProvider(시스템 시계)로 "지금"을
    // 판단한다 — Validator가 이 앱의 Clock 빈을 쓰도록 재정의한다.
    @Bean
    public LocalValidatorFactoryBean validator(Clock clock) {
        return new LocalValidatorFactoryBean() {
            @Override
            protected void postProcessConfiguration(jakarta.validation.Configuration<?> configuration) {
                configuration.clockProvider(() -> clock);
            }
        };
    }
}
