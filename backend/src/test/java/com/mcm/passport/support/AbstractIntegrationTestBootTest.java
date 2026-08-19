package com.mcm.passport.support;

import org.junit.jupiter.api.Test;

class AbstractIntegrationTestBootTest extends AbstractIntegrationTest {

    @Test
    void contextLoadsWithRealPostgres() {
        // 상속만 해도 Spring 컨텍스트 + Flyway 마이그레이션이 실제 PostgreSQL
        // 컨테이너에 적용된 채로 뜨는지 확인하는 스모크 테스트
    }
}
