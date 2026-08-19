package com.mcm.passport.common.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.auditing.DateTimeProvider;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Optional;

// dateTimeProviderRef를 지정해, @CreatedDate로 채워지는 모든 엔티티의 createdAt이 실제
// 시스템 시계가 아니라 이 앱에 주입된 Clock 빈을 통하도록 한다 — 고정 Clock으로 시간을 얼리는
// 테스트가 createdAt에도 그대로 반영되게 하기 위함(엔티티는 Spring 빈이 아니라 생성자로 Clock을
// 주입받을 수 없으므로, JPA 감사(auditing) 인프라를 통해 우회한다).
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

    // Bean Validation의 @PastOrPresent/@FutureOrPresent 등은 기본적으로 자기 자신의
    // ClockProvider(실제 시스템 시계)로 "지금"을 판단한다 — Boot가 자동 구성하는 Validator를
    // 이 앱의 Clock 빈을 쓰도록 재정의해, 고정 Clock으로 시간을 얼리는 테스트에서 검증 결과도
    // 일관되게 나오도록 한다.
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
