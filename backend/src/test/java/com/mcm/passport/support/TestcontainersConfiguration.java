package com.mcm.passport.support;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * One Postgres container shared by every integration test class in the whole JVM.
 *
 * The container is started from a static field, not from JUnit5's {@code @Container}/
 * {@code @Testcontainers} lifecycle: that combination re-triggered container creation once
 * per subclass of {@link AbstractIntegrationTest} (16 separate containers per full test run),
 * exhausting Docker and causing ~19 tests to intermittently fail on connection timeouts.
 * A static field is guaranteed by the JVM to initialize exactly once, so this is the actual
 * fix, not just a relabeling of the same mechanism.
 */
@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfiguration {

    private static final PostgreSQLContainer<?> POSTGRES =
        new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("mcm_passport_test")
            .withUsername("test")
            .withPassword("test");

    static {
        POSTGRES.start();
    }

    @Bean
    @ServiceConnection
    PostgreSQLContainer<?> postgresContainer() {
        return POSTGRES;
    }
}
