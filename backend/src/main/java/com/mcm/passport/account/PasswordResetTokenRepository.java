package com.mcm.passport.account;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import java.util.Optional;

public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetToken, Long> {
    Optional<PasswordResetToken> findByToken(String token);

    // confirmPasswordReset() 전용. 동시 요청 둘 다 isUsable() 체크를 통과해 토큰이 두 번
    // 쓰이지 않도록 행 잠금을 잡고 조회한다. 이 트랜잭션에서 토큰을 처음 로드하는 지점이어야
    // 한다 — 다른 조회가 먼저 캐시해두면 1차 캐시 때문에 잠금 후에도 오래된 값을 보게 된다.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from PasswordResetToken t where t.token = :token")
    Optional<PasswordResetToken> findByTokenForUpdate(String token);
}
