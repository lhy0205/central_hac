package com.mcm.passport.support;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * One Postgres container shared by every integration test class in the whole JVM.
 *
 * Started from a static field rather than JUnit5's {@code @Container}/{@code @Testcontainers}
 * lifecycle, which spins up a separate container per subclass of {@link AbstractIntegrationTest}
 * and can exhaust Docker on a full test run. A static field is guaranteed by the JVM to
 * initialize exactly once.
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
