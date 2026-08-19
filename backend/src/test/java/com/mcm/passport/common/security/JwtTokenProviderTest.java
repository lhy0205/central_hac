package com.mcm.passport.common.security;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JwtTokenProviderTest {

    private final JwtTokenProvider provider = new JwtTokenProvider(
        new JwtProperties("test-secret-key-must-be-at-least-32-bytes-long", 60_000));

    @Test
    void generatesAndParsesToken() {
        String token = provider.generateToken(42L);

        assertThat(provider.isValid(token)).isTrue();
        assertThat(provider.getAccountId(token)).isEqualTo(42L);
    }

    @Test
    void invalidTokenIsRejected() {
        assertThat(provider.isValid("garbage-token")).isFalse();
    }

    @Test
    void rejectsThePubliclyKnownDefaultSecretPlaceholder() {
        // JWT_SECRET을 설정하지 않으면 application.yml의 공개된 기본값이
        // 그대로 쓰여 누구나 토큰을 위조할 수 있었다 — 그 값이면 즉시 시작을 막아야 한다.
        assertThatThrownBy(() -> new JwtTokenProvider(
                new JwtProperties("change-this-secret-change-this-secret-32chars-min", 60_000)))
            .isInstanceOf(IllegalStateException.class);
    }
}
