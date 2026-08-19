package com.mcm.passport.support;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

@Tag("integration")
@Import(TestcontainersConfiguration.class)
@SpringBootTest
public abstract class AbstractIntegrationTest {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    // The Postgres container (and its data) is now shared by every integration test class
    // (see TestcontainersConfiguration). Without this, fixture values that collide across
    // classes (e.g. the same serial number or email used in two different test files) trip
    // unique constraints depending on execution order.
    //
    // Don't add @Transactional to a subclass: Postgres TRUNCATE is transactional too, so it
    // would get rolled back along with the test's own data at test end, silently undoing
    // this cleanup for whichever test runs next.
    @BeforeEach
    void cleanDatabase() {
        jdbcTemplate.execute("""
            TRUNCATE TABLE
                reservation, timeline_event, transfer_code, notification, care_record,
                diagnosis, password_reset_token, passport, account, shedlock
            RESTART IDENTITY CASCADE
            """);
    }
}
