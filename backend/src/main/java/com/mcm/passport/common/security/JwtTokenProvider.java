package com.mcm.passport.common.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

@Component
public class JwtTokenProvider {

    // application.yml의 jwt.secret 기본값 — JWT_SECRET 환경변수가 없으면 이 값으로 떨어진다. 이
    // 문자열 자체가 이 저장소 히스토리에 그대로 공개돼 있으므로, 배포 환경이 이 값을 그대로 쓰면
    // 누구나 임의의 accountId로 유효한 서명된 JWT를 위조해 완전한 계정 탈취가 가능하다 — 조용히
    // 기본값을 쓰는 대신 시작 시점에 즉시 실패시킨다.
    private static final String PUBLIC_DEFAULT_SECRET_PLACEHOLDER =
        "change-this-secret-change-this-secret-32chars-min";

    private final SecretKey key;
    private final long expirationMs;

    public JwtTokenProvider(JwtProperties properties) {
        if (PUBLIC_DEFAULT_SECRET_PLACEHOLDER.equals(properties.secret())) {
            throw new IllegalStateException(
                "JWT_SECRET 환경변수를 반드시 설정해야 합니다 — application.yml의 기본값은 이 저장소에 " +
                "공개된 값이라 그대로 쓰면 누구나 토큰을 위조할 수 있습니다.");
        }
        this.key = Keys.hmacShaKeyFor(properties.secret().getBytes(StandardCharsets.UTF_8));
        this.expirationMs = properties.expirationMs();
    }

    public String generateToken(Long accountId) {
        Date now = new Date();
        Date expiry = new Date(now.getTime() + expirationMs);
        return Jwts.builder()
            .subject(String.valueOf(accountId))
            .issuedAt(now)
            .expiration(expiry)
            .signWith(key)
            .compact();
    }

    public Long getAccountId(String token) {
        Claims claims = Jwts.parser().verifyWith(key).build()
            .parseSignedClaims(token).getPayload();
        return Long.valueOf(claims.getSubject());
    }

    public boolean isValid(String token) {
        try {
            Jwts.parser().verifyWith(key).build().parseSignedClaims(token);
            return true;
        } catch (JwtException | IllegalArgumentException e) {
            return false;
        }
    }
}
